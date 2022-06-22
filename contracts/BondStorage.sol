// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


contract BondStorage is AccessControl {
	bytes32 public constant WHITELIST_BOND_STORAGE = keccak256("WHITELIST_BOND_STORAGE");

	constructor() {
		_setupRole(WHITELIST_BOND_STORAGE, msg.sender);
	}

	modifier onlyOwner {
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
		uint256 principal;      // amount in sEURO
		uint256 rate;           // example: 500 is 0.5 pc per annum (= 0.005)
		uint256 maturity;       // in amount of weeks
		bool tapped;            // if we squeezed the profit from this bond
		PositionMetaData data;  // liquidity position data
	}

	// BondRecord holds the main data
	struct BondRecord {
		bool isInitialised;         // if the user has bonded before
		bool isActive;              // if the user has an active bond
		uint256 amountBondsActive;  // amount of bonds in play
		Bond[] bonds;               // all the bonds in play
		uint256 profitAmount;       // total profit: all payout less the principals
		uint256 claimAmount;        // total claim from expired bonds (valued in sEURO)
	}

	mapping(address => BondRecord) issuedBonds;

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

	function addBond(address _user, uint256 _principal, uint256 _rate, uint256 maturityDate, PositionMetaData memory _data) private {
		issuedBonds[_user].bonds.push(Bond(_principal, _rate, maturityDate, false, _data));
	}

	function tapBond(address _user, uint256 index) private {
		issuedBonds[_user].bonds[index].tapped = true;
	}

	function increaseProfitAmount(address _user, uint256 latestAddition) private {
		uint256 newProfit = SafeMath.add(latestAddition, issuedBonds[_user].profitAmount);
		issuedBonds[_user].profitAmount = newProfit;
	}

	function increaseClaimAmount(address _user, uint256 latestAddition) private {
		uint256 newClaim = SafeMath.add(latestAddition, issuedBonds[_user].claimAmount);
		issuedBonds[_user].claimAmount = newClaim;
	}

	// Returns the total payout and the accrued interest ("profit") component separately
	function calculateBond(Bond memory bond) private pure returns (uint256, uint256) {
		// basic (rate * principal) calculations
		uint256 rateFactor = 100000; // due to the way we store interest rates
		uint256 ratePrincipal = SafeMath.mul(bond.rate, bond.principal);
		uint256 denominator = SafeMath.add(bond.principal, ratePrincipal);
		uint256 payout = SafeMath.div(denominator, rateFactor);
		uint256 profit = SafeMath.div(ratePrincipal, rateFactor);
		return (payout, profit);
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

	function maturityDateAfterWeeks(uint256 _maturityInWeeks) private view returns (uint256) {
		uint256 current = block.timestamp;
		uint256 secondsPerWeek = 1 weeks; // 7 * 24 * 60 * 60
		return current + _maturityInWeeks * secondsPerWeek;
	}


	/// ================ BondStorage public APIs ==============

	function startBond(
		address _user,
		uint256 _principal,
		uint256 _rate,
		uint256 _maturityInWeeks,
		uint256 _tokenId,
		uint128 _liquidity,
		uint256 _amountSeuro,
		uint256 _amountOther
	) external {
		uint256 maturityDate = maturityDateAfterWeeks(_maturityInWeeks);

		if (!isInitialised(_user)) {
			setActive(_user);
			setInitialised(_user);
		}

		PositionMetaData memory data = PositionMetaData(_tokenId, _liquidity, _amountSeuro, _amountOther);
		addBond(_user, _principal, _rate, maturityDate, data);
		incrementActiveBonds(_user);
	}

	// Refreshes the bond status of a user.
	// When calling this function:
	// If the user is not already in the system, it is not initialised.
	// If the user adds a bond for the first time, it is both initialised and active.
	// If the user has no bond that has passed its maturity, nothing changes.
	// If the user has at least one bond that has passed maturity, the amountBondsActive is
	// subtracted with the appropriate amount and the claim counter is increased with the
	// principal(s) and the accrued interest.
	// If the user has no bonds active, the isActive will be switched to false.
	function refreshBondStatus(address _user) public {
		Bond[] memory bonds = getUserBonds(_user);
		uint256 total = getActiveBonds(_user); // bound it to avoid transaction failed due running out of gas

		// check each bond to see if it has expired.
		// we do the O(n) solution and check each bond at every refresh
		// TODO: to optimise later with more clever sorting algo
		for (uint i = 0; i < total;) {
			if (hasExpired(bonds[i]) && !bonds[i].tapped) {
				tapBond(_user, i); // prevents the abuse of squeezing profit from same bond more than once
				(uint256 payout, uint256 profit) = calculateBond(bonds[i]);
				increaseProfitAmount(_user, profit);
				increaseClaimAmount(_user, payout);
				decrementActiveBonds(_user);
				unchecked { i++; }
			}
		}
	}

	function getActiveBonds(address _user) public view returns (uint256) {
		return issuedBonds[_user].amountBondsActive;
	}

	function getUserBonds(address _user) public view virtual returns (Bond[] memory) {
		return issuedBonds[_user].bonds;
	}

	function getBondAt(address _user, uint256 index) public view virtual returns (Bond memory) {
		return getUserBonds(_user)[index];
	}

	function getProfit(address _user) public view virtual returns (uint256) {
		return issuedBonds[_user].profitAmount;
	}

	// Defunds the claim the user has by receiving TST tokens equal to the claim value left.
	// This function has to be connected to a middle / cache layer.
	function defundClaim(address _user, uint256 deduct) public onlyOwner {
		uint256 currClaim = issuedBonds[_user].claimAmount;
		uint256 newClaim = SafeMath.sub(currClaim, deduct);
		issuedBonds[_user].claimAmount = newClaim;
	}
}
