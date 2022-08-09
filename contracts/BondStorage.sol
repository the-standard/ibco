// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./StandardTokenGateway.sol";

contract BondStorage is AccessControl {
    bytes32 public constant WHITELIST_ADMIN = keccak256("WHITELIST_ADMIN");
    bytes32 public constant WHITELIST_BOND_STORAGE = keccak256("WHITELIST_BOND_STORAGE");

    // Standard Token data feed
    StandardTokenGateway private tokenGateway;

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

    modifier onlyWhitelisted() {
        require(hasRole(WHITELIST_BOND_STORAGE, msg.sender), "invalid-user");
        _;
    }

    // PositionMetaData holds meta data received from Uniswap when adding a liquidity position
    struct PositionMetaData {
        // NFT handle
        uint256 tokenId;
        // New liquidity (geometric average) at moment of transaction
        uint128 liquidity;
        // Units of tokens
        uint256 amountSeuro;
        uint256 amountOther;
    }

    // Bond is a traditional bond: exchanged for a principal with a fixed rate and maturity
    struct Bond {
        uint256 principalSeuro; // amount in sEURO
        uint256 principalOther; // amount in sEURO
        uint256 rate; // example: 500 is 0.5 pc per annum (= 0.005)
        uint256 maturity; // in amount of weeks
        bool tapped; // if we squeezed the profit from this bond
        PositionMetaData data; // liquidity position data
    }

    // BondRecord holds the main data
    struct BondRecord {
        bool isInitialised; // if the user has bonded before
        bool isActive; // if the user has an active bond
        uint256 amountBondsActive; // amount of bonds in play
        Bond[] bonds; // all the bonds in play
        uint256 profitAmount; // total profit: all payout less the principals
        uint256 claimAmount; // total claim from expired bonds (valued in sEURO)
    }

    mapping(address => BondRecord) issuedBonds;

    function setBondingEvent(address _address) external onlyWhitelisted {
        grantRole(WHITELIST_BOND_STORAGE, _address);
    }

    function isInitialised(address _user) private view returns (bool) {
        return issuedBonds[_user].isInitialised;
    }

    function setInitialised(address _user) private {
        issuedBonds[_user].isInitialised = true;
    }

    function isActive(address _user) private view returns (bool) {
        return issuedBonds[_user].isActive;
    }

    function setActive(address _user) private {
        issuedBonds[_user].isActive = true;
    }

    function addBond(
        address _user,
        uint256 _principalSeuro,
        uint256 _principalOther,
        uint256 _rate,
        uint256 maturityDate,
        PositionMetaData memory _data
    ) private {
        issuedBonds[_user].bonds.push(
            Bond(
                _principalSeuro,
                _principalOther,
                _rate,
                maturityDate,
                false,
                _data
            )
        );
    }

    function tapBond(address _user, uint256 index) private {
        issuedBonds[_user].bonds[index].tapped = true;
    }

    function increaseProfitAmount(address _user, uint256 latestAddition)
        private
    {
        uint256 currAmount = issuedBonds[_user].profitAmount;
        uint256 newProfit = latestAddition + currAmount;
        issuedBonds[_user].profitAmount = newProfit;
    }

    function increaseClaimAmount(address _user, uint256 latestAddition)
        private
    {
        uint256 newClaim = issuedBonds[_user].claimAmount + latestAddition;
        issuedBonds[_user].claimAmount = newClaim;
    }

    // Returns the total payout and the accrued interest ("profit") component separately.
    // Both the payout and the profit is in sEURO.
    function calculateBond(Bond memory bond)
        private
        pure
        returns (
            uint256 seuroPayout,
            uint256 seuroProfit,
            uint256 otherPayout,
            uint256 otherProfit
        )
    {
        // basic (rate * principal) calculations
        uint256 rateFactor = 100000; // due to the way we store interest rates
        uint256 seuroRatePrincipal = bond.rate * bond.principalSeuro;
        seuroProfit = seuroRatePrincipal / rateFactor;
        seuroPayout = bond.principalSeuro + seuroProfit;
        uint256 otherRatePrincipal = bond.rate * bond.principalOther;
        otherProfit = otherRatePrincipal / rateFactor;
        otherPayout = bond.principalOther + otherProfit;
    }

    function incrementActiveBonds(address _user) private {
        issuedBonds[_user].amountBondsActive += 1;
    }

    function decrementActiveBonds(address _user) private {
        issuedBonds[_user].amountBondsActive -= 1;
    }

    function hasExpired(Bond memory bond) private view returns (bool) {
        return block.timestamp >= bond.maturity;
    }

    function maturityDateAfterWeeks(uint256 _maturityInWeeks)
        private
        view
        returns (uint256)
    {
        uint256 current = block.timestamp;
        uint256 secondsPerWeek = 1 weeks; // 7 * 24 * 60 * 60
        return current + _maturityInWeeks * secondsPerWeek;
    }

    function seuroToStandardToken(uint256 _amount)
        private
        view
        returns (uint256)
    {
        (uint256 price, bool inversed) = tokenGateway
            .getSeuroStandardTokenPrice();
        return inversed ? _amount * price : _amount / price;
    }

    function otherTokenToStandardToken(uint256 _amount)
        private
        view
        returns (uint256)
    {
        (, int256 eurOtherRate, , , ) = IChainlink(chainlinkEurOther)
            .latestRoundData();
        uint256 seuros = (_amount * 10**otherUsdDec) / uint256(eurOtherRate);
        return seuroToStandardToken(seuros);
    }

    function isBondingPossible(
        uint256 _principalSeuro,
        uint256 _principalOther,
        uint256 _rate,
        uint256 _maturityInWeeks
    ) private view returns (bool, uint256) {
        Bond memory dummyBond = Bond(
            _principalSeuro,
            _principalOther,
            _rate,
            _maturityInWeeks,
            false,
            PositionMetaData(0, 0, 0, 0)
        );
        (uint256 seuroPayout, , uint256 otherPayout, ) = calculateBond(
            dummyBond
        );
        uint256 tokenPayout = seuroToStandardToken(seuroPayout) +
            otherTokenToStandardToken(otherPayout);
        uint256 actualSupply = tokenGateway.getRewardSupply();
        // if we are able to payout this bond in TST
        return (tokenPayout < actualSupply, tokenPayout);
    }

    /// ================ BondStorage public APIs ==============

    function startBond(
        address _user,
        uint256 _principalSeuro,
        uint256 _principalOther,
        uint256 _rate,
        uint256 _maturityInWeeks,
        uint256 _tokenId,
        uint128 _liquidity
    ) external onlyWhitelisted {
        (bool ok, uint256 futurePayout) = isBondingPossible(
            _principalSeuro,
            _principalOther,
            _rate,
            _maturityInWeeks
        );
        require(ok == true, "err-insuff-tst-supply");

        uint256 maturityDate = maturityDateAfterWeeks(_maturityInWeeks);
        if (!isInitialised(_user)) {
            setActive(_user);
            setInitialised(_user);
        }

        // reduce the amount of available bonding reward TSTs
        tokenGateway.decreaseRewardSupply(futurePayout);

        // finalise record of bond
        PositionMetaData memory data = PositionMetaData(
            _tokenId,
            _liquidity,
            _principalSeuro,
            _principalOther
        );
        addBond(
            _user,
            _principalSeuro,
            _principalOther,
            _rate,
            maturityDate,
            data
        );
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
    function refreshBondStatus(address _user) external onlyWhitelisted {
        Bond[] memory bonds = getUserBonds(_user);

        // check each bond to see if it has expired.
        // we do the O(n) solution and check each bond at every refresh
        for (uint256 i = 0; i < bonds.length; i++) {
            if (hasExpired(bonds[i]) && !bonds[i].tapped) {
                tapBond(_user, i); // prevents the abuse of squeezing profit from same bond more than once

                // here we calculate how much we are paying out in sEUR in total and the
                // profit component, also in sEUR.
                (
                    uint256 totalPayoutSeuro,
                    uint256 profitSeuro,
                    uint256 totalPayoutOther,
                    uint256 profitOther
                ) = calculateBond(bonds[i]);
                uint256 payoutTok = seuroToStandardToken(totalPayoutSeuro) +
                    otherTokenToStandardToken(totalPayoutOther);
                uint256 profitTok = seuroToStandardToken(profitSeuro) +
                    otherTokenToStandardToken(profitOther);

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

    function getActiveBonds(address _user) public view returns (uint256) {
        return issuedBonds[_user].amountBondsActive;
    }

    function getUserBonds(address _user)
        public
        view
        virtual
        returns (Bond[] memory)
    {
        return issuedBonds[_user].bonds;
    }

    function getBondAt(address _user, uint256 index)
        public
        view
        virtual
        returns (Bond memory)
    {
        return getUserBonds(_user)[index];
    }

    function getProfit(address _user) public view virtual returns (uint256) {
        return issuedBonds[_user].profitAmount;
    }

    function getClaimAmount(address _user)
        public
        view
        virtual
        returns (uint256)
    {
        return issuedBonds[_user].claimAmount;
    }

    // Claims the payout in TST tokens by sending it to the user's wallet and resetting the claim to zero.
    function claimReward(address _user) external onlyWhitelisted {
        uint256 rewardAmount = issuedBonds[_user].claimAmount;
        require(rewardAmount > 0, "err-no-reward");
        issuedBonds[_user].claimAmount = 0;
        tokenGateway.transferReward(_user, rewardAmount);
    }
}
