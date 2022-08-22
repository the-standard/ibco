// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "contracts/Stage2/StandardTokenGateway.sol";
import "contracts/Rates.sol";

contract BondStorage is AccessControl {
    bytes32 public constant WHITELIST_ADMIN = keccak256("WHITELIST_ADMIN");
    bytes32 public constant WHITELIST_BOND_STORAGE = keccak256("WHITELIST_BOND_STORAGE");

    // Standard Token data feed
    StandardTokenGateway public tokenGateway;

    // used to convert other token to seuro value (before converting to TST)
    // dec should be default chainlink 8 for default 18 dec tokens (to match sEURO)
    // dec should be 20 when other asset is a 6 dec token
    address public chainlinkEurOther;
    uint8 public otherUsdDec;

    constructor(address _gatewayAddress, address _chainlinkEurOther, uint8 _otherUsdDec) {
        _grantRole(WHITELIST_ADMIN, msg.sender);
        _setRoleAdmin(WHITELIST_BOND_STORAGE, WHITELIST_ADMIN);
        grantRole(WHITELIST_BOND_STORAGE, msg.sender);
        tokenGateway = StandardTokenGateway(_gatewayAddress);
        chainlinkEurOther = _chainlinkEurOther;
        otherUsdDec = _otherUsdDec;
    }

    modifier onlyWhitelisted() { require(hasRole(WHITELIST_BOND_STORAGE, msg.sender), "invalid-storage-operator"); _; }

    // PositionMetaData holds meta data received from Uniswap when adding a liquidity position
    // tokenId = NFT handle
    // liquidity = New liquidity (geometric average) at moment of transaction
    struct PositionMetaData { uint256 tokenId; uint128 liquidity; uint256 amountSeuro; uint256 amountOther; }

    // Bond is a traditional bond: exchanged for a principal with a fixed rate and maturity
    // principalSeuro = amount bonding in sEURO
    // principalOther = amount bonding in other asset
    // rate = interest rate for bond - example: 500 is 0.5 pc per annum (= 0.005)
    // maturity = length of bond in weeks
    // tapped = if profit has been squeezed from bond
    // PositionMetaData = liquidity position data
    struct Bond { uint256 principalSeuro; uint256 principalOther; uint256 rate; uint256 maturity; bool tapped; PositionMetaData data; }

    // BondRecord holds the main data
    // isInitialised = if the user has bonded before
    // isActive = if the user has an active bond
    // amountBondsActive = amount of bonds in play
    // bonds = all the bonds in play
    // profitAmount = profit amount from bond (in TST)
    // claimAmount = total claim from expired bonds (in TST)
    struct BondRecord { bool isInitialised; bool isActive; uint256 amountBondsActive; Bond[] bonds; uint256 profitAmount; uint256 claimAmount; }

    mapping(address => BondRecord) issuedBonds;

    function setBondingEvent(address _address) public onlyWhitelisted { grantRole(WHITELIST_BOND_STORAGE, _address); }

    function setTokenGateway(address _newAddress) public onlyWhitelisted {
        require(_newAddress != address(0), "invalid-gateway-address");
        tokenGateway = StandardTokenGateway(_newAddress);
    }

    function setInitialised(address _user) private { issuedBonds[_user].isInitialised = true; }

    function setActive(address _user) private { issuedBonds[_user].isActive = true; }

    function addBond(address _user, uint256 _principalSeuro, uint256 _principalOther, uint256 _rate, uint256 maturityDate, PositionMetaData memory _data) private {
        issuedBonds[_user].bonds.push(Bond(_principalSeuro, _principalOther, _rate, maturityDate, false, _data));
    }

    function tapBond(address _user, uint256 index) private { issuedBonds[_user].bonds[index].tapped = true; }

    function increaseProfitAmount(address _user, uint256 latestAddition) private { issuedBonds[_user].profitAmount += latestAddition; }

    function increaseClaimAmount(address _user, uint256 latestAddition) private { issuedBonds[_user].claimAmount += latestAddition; }

    // Returns the total payout and the accrued interest ("profit") component separately.
    // Both the payout and the profit is in sEURO.
    function calculateBond(Bond memory bond) private pure returns (uint256 seuroPayout, uint256 seuroProfit, uint256 otherPayout, uint256 otherProfit) {
        // rates are stored as 5 dec in operator
        seuroProfit = Rates.convertDefault(bond.principalSeuro, bond.rate, 5);
        seuroPayout = bond.principalSeuro + seuroProfit;
        otherProfit = Rates.convertDefault(bond.principalOther, bond.rate, 5);
        otherPayout = bond.principalOther + otherProfit;
    }

    function incrementActiveBonds(address _user) private { issuedBonds[_user].amountBondsActive++ ; }

    function decrementActiveBonds(address _user) private { issuedBonds[_user].amountBondsActive-- ; }

    function hasExpired(Bond memory bond) private view returns (bool) { return block.timestamp >= bond.maturity; }

    function maturityDateAfterWeeks(uint256 _maturityInWeeks) private view returns (uint256) { return block.timestamp + _maturityInWeeks * 1 weeks; }

    function otherTokenToStandardToken(uint256 _amount) private view returns (uint256) {
        (, int256 eurOtherRate, , , ) = IChainlink(chainlinkEurOther).latestRoundData();
        uint256 eur = Rates.convertInverse(_amount, uint256(eurOtherRate), otherUsdDec);
        return seuroToStandardToken(eur);
    }

    function seuroToStandardToken(uint256 _amount) private view returns (uint256) { return Rates.convertInverse(_amount, tokenGateway.getPrice(), tokenGateway.priceDec()); }

    function potentialPayout(uint256 _principalSeuro, uint256 _principalOther, uint256 _rate, uint256 _maturityInWeeks) private view returns (uint256 tokenPayout) {
        Bond memory dummyBond = Bond(_principalSeuro, _principalOther, _rate, _maturityInWeeks, false, PositionMetaData(0, 0, 0, 0));
        (uint256 seuroPayout, , uint256 otherPayout, ) = calculateBond(dummyBond);
        tokenPayout = seuroToStandardToken(seuroPayout) + otherTokenToStandardToken(otherPayout);
        // if we are able to payout this bond in TST
        require(tokenPayout < tokenGateway.bondRewardPoolSupply() == true, "err-insuff-tst-supply");
    }

    /// ================ BondStorage public APIs ==============

    function startBond(address _user, uint256 _principalSeuro, uint256 _principalOther, uint256 _rate, uint256 _maturityInWeeks, uint256 _tokenId, uint128 _liquidity) external onlyWhitelisted {
        // reduce the amount of available bonding reward TSTs
        tokenGateway.decreaseRewardSupply(potentialPayout(_principalSeuro, _principalOther, _rate, _maturityInWeeks));
        
        if (!issuedBonds[_user].isInitialised) {
            setActive(_user);
            setInitialised(_user);
        }

        // finalise record of bond
        addBond(_user, _principalSeuro, _principalOther, _rate, maturityDateAfterWeeks(_maturityInWeeks), PositionMetaData(_tokenId, _liquidity, _principalSeuro, _principalOther));
        incrementActiveBonds(_user);
    }

    // Refreshes the bond status of a user.
    // When calling this function:
    // If the user is not already in the system, it is not initialised.
    // If the user adds a bond for the first time, it is both initialised and active.
    // If the user has no bond that has passed its maturity, nothing changes.
    // If the user has at least one bond that has passed maturity, the amountBondsActive is
    // subtracted with the appropriate amount and the claim counter is increased with the
    // sum of the principals and the their respective accrued interest, all in TST.
    // If the user has no bonds active, the isActive will be switched to false.
    function refreshBondStatus(address _user) public {
        Bond[] memory bonds = getUserBonds(_user);

        // check each bond to see if it has expired.
        // we do the O(n) solution and check each bond at every refresh
        for (uint256 i = 0; i < bonds.length; i++) {
            if (hasExpired(bonds[i]) && !bonds[i].tapped) {
                tapBond(_user, i); // prevents the abuse of squeezing profit from same bond more than once

                // here we calculate how much we are paying out in sEUR in total and the
                // profit component, also in sEUR.
                (uint256 totalPayoutSeuro, uint256 profitSeuro, uint256 totalPayoutOther, uint256 profitOther) = calculateBond(bonds[i]);
                uint256 payoutTok = seuroToStandardToken(totalPayoutSeuro) + otherTokenToStandardToken(totalPayoutOther);
                uint256 profitTok = seuroToStandardToken(profitSeuro) + otherTokenToStandardToken(profitOther);

                // increase the user's accumulated profit. only for show or as "fun to know"
                increaseProfitAmount(_user, profitTok);

                // add the total payout in tokens as a claim. this is the principal in sEURO converted
                // to TST and the profit in sEUR converted to TST.
                increaseClaimAmount(_user, payoutTok);

                // one less bond active since this has expired
                decrementActiveBonds(_user);
            }
        }
    }

    function getActiveBonds(address _user) public view returns (uint256) { return issuedBonds[_user].amountBondsActive; }

    function getUserBonds(address _user) public view virtual returns (Bond[] memory) { return issuedBonds[_user].bonds; }

    function getBondAt(address _user, uint256 index) public view virtual returns (Bond memory) { return getUserBonds(_user)[index]; }

    function getProfit(address _user) public view virtual returns (uint256) { return issuedBonds[_user].profitAmount; }

    function getClaimAmount(address _user) public view virtual returns (uint256) { return issuedBonds[_user].claimAmount; }

    // Claims the payout in TST tokens by sending it to the user's wallet and resetting the claim to zero.
    function claimReward(address _user) public {
        uint256 rewardAmount = issuedBonds[_user].claimAmount;
        require(rewardAmount > 0, "err-no-reward");
        issuedBonds[_user].claimAmount = 0;
        tokenGateway.transferReward(_user, rewardAmount);
    }
}
