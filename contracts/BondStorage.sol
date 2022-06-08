// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

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
		int128 principal;      // amount in sEURO
		int128 rate;           // example: 500 is 0.05 pc per annum
		uint256 maturity;      // in amount of weeks
		PositionMetaData data; // liquidity position data
	}

	// BondRecord holds the main data
	struct BondRecord {
		bool isInitialised;        // if the user has bonded before
		bool isActive;             // if the user has an active bond
		int128 amountBondsActive;  // amount of bonds in play
		Bond[] bonds;              // all the bonds in play
		int128 profitAmount;       // total profit: all payout less the principals
		int128 claimAmount;        // total claim from expired bonds (valued in sEURO)
	}

	BondRecord bondRecord;

	// Public record of all bonds issued for this currency pair
	mapping(address => BondRecord) public issuedBonds;

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

	function addBond(address _user, Bond memory bond) private {
		issuedBonds[_user].bonds.push(bond);
	}

	function increaseProfitAmount(address _user, int128 latestAddition) private {
		int128 currProfit = issuedBonds[_user].profitAmount;
		int128 newProfit = ABDKMath64x64.add(latestAddition, currProfit);
		issuedBonds[_user].profitAmount = newProfit;
	}

	function increaseClaimAmount(address _user, int128 latestAddition) private {
		int128 currClaim = issuedBonds[_user].claimAmount;
		int128 newClaim = ABDKMath64x64.add(latestAddition, currClaim);
		issuedBonds[_user].claimAmount = newClaim;
	}

	// Defunds the claim the user has by receiving TST tokens equal to the claim value left.
	// This function has to be connected to a middle / cache layer.
	function defundClaim(address _user, int128 deduct) public onlyOwner {
		int128 currClaim = issuedBonds[_user].claimAmount;
		int128 newClaim = ABDKMath64x64.sub(currClaim, deduct);
		issuedBonds[_user].claimAmount = newClaim;
	}

	// Returns the total payout and the accrued interest ("profit") component separately
	function calculateBond(Bond memory bond) private pure returns (int128, int128) {
		int128 pc = ABDKMath64x64.div(bond.rate, 10 ** 4);
		int128 profit = ABDKMath64x64.mul(pc, bond.principal);
		return (bond.principal + profit, profit);
	}

	function incrementActiveBonds(address _user) private returns (int128) {
		int128 plusOne = ABDKMath64x64.add(issuedBonds[_user].amountBondsActive, 1);
		issuedBonds[_user].amountBondsActive = plusOne;
		return issuedBonds[_user].amountBondsActive;
	}

	function decrementActiveBonds(address _user) private returns (int256) {
		int128 minusOne = ABDKMath64x64.sub(issuedBonds[_user].amountBondsActive, 1);
		issuedBonds[_user].amountBondsActive = minusOne;
		return issuedBonds[_user].amountBondsActive;
	}

	function getActiveBonds(address _user) private view returns (int256) {
		return issuedBonds[_user].amountBondsActive;
	}

	function getUserBonds(address _user) private view returns (Bond[] memory) {
		return issuedBonds[_user].bonds;
	}

	function getUserBondAt(address _user, uint256 index) private view returns (Bond memory) {
		return getUserBonds(_user)[index];
	}

	function hasExpired(Bond memory bond) private view returns (bool) {
		return block.timestamp >= bond.maturity;
	}

	// Swap the location of two bonds which are contiguous in an array.
	// TODO: use as optimisation for later, leave it unused for now
	function bondOrderSwap(address _user, uint8 i, uint8 j) private {
		Bond memory temporary = issuedBonds[_user].bonds[i];
		issuedBonds[_user].bonds[i] = issuedBonds[_user].bonds[j];
		issuedBonds[_user].bonds[j] = temporary;
	}

	// Insertion sort.
	// Implementation is based on on the insertion sort algorithm.
	// TODO: use as optimisation for later, leave it unused for now
	function insertSort(address _user) private {
		uint256 total = getUserBonds(_user).length;

		uint8 i = 1;
		uint8 j = 0;
		for (j = i; i < total; i++) {
			Bond[] memory latestUpd = getUserBonds(_user);
			if (j > 0 && latestUpd[j-1].maturity > latestUpd[j].maturity) {
				bondOrderSwap(_user, i, j);
				j--;
			}
		}
	}

	function maturityDateAfterWeeks(uint256 _maturityInWeeks) private view returns (uint256) {
		uint256 current = block.timestamp;
		uint256 secondsPerWeek = 1 weeks; // 7 * 24 * 60 * 60
		return current + _maturityInWeeks * secondsPerWeek;
	}


	function addRecord(
		address _user,
		int128 _principal,
		int128 _rate,
		uint256 _maturityInWeeks,
		PositionMetaData memory _data
	) public onlyOwner {
		uint256 maturityDate = maturityDateAfterWeeks(_maturityInWeeks);
		Bond memory bond = Bond(_principal, _rate, maturityDate, _data);

		if (!isInitialised(_user)) {
			setActive(_user);
			setInitialised(_user);
		}
		addBond(_user, bond);
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
	function refreshBondStatus(address _user) public onlyOwner {
		Bond[] memory bonds = getUserBonds(_user);
		uint256 total = bonds.length;

		// check each bond to see if it has expired.
		// we do the O(n) solution and check each bond at every refresh
		// TODO: to optimise later with more clever sorting algo
		for (uint i = 0; i < total; i++) {
			if (hasExpired(bonds[i])) {
				(int128 payout, int128 profit) = calculateBond(bonds[i]);
				increaseProfitAmount(_user, profit);
				increaseClaimAmount(_user, payout);
				decrementActiveBonds(_user);
			}
		}
	}

}
