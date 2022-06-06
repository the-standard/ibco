// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract BondStorage is AccessControl {
	bytes32 public constant WHITELIST_BOND_STORAGE = keccak256("WHITELIST_BOND_STORAGE");

	constructor() {
		_setupRole(WHITELIST_BOND_STORAGE, msg.sender);
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
		uint256 principal;     // amount in sEURO
		uint256 rate;          // example: 500 is 0.05 pc per annum
		uint256 maturity;      // in amount of weeks
		PositionMetaData data; // liquidity position data
	}

	// BondRecord holds the main data 
	struct BondRecord {
		bool isInitialised;        // if the user has bonded before
		bool isActive;             // if the user has an active bond
		uint256 amountBondsActive; // amount of bonds in play
		Bond[] bonds;              // all the bonds in play
		uint256 interestReceived;  // total profit: all payout less the principals
		uint256 claimAmount;       // amount to be claimed from expired bonds
	}

	BondRecord bondRecord;

	// Public record of all bonds issued for this currency pair
	mapping(address => BondRecord) public issuedBonds;

	function isInitialised(address _user) private returns (bool) {
		return issuedBonds[_user].isInitialised;
	}

	function setInitialised(address _user) private {
		issuedBonds[_user].isInitialised = true;
	}

	function isActive(address _user) public returns (bool) {
		return issuedBonds[_user].isActive;
	}

	function setActive(address _user) private {
		issuedBonds[_user].isActive = true;
	}

	function addBond(address _user, Bond memory bond) private {
		issuedBonds[_user].bonds.push(bond);
	}

	function incrementActiveBonds(address _user) private returns (uint256) {
		issuedBonds[_user].amountBondsActive += 1;
		return issuedBonds[_user].amountBondsActive;
	}

	function addRecord(
		address _user,
		uint256 _principal,
		uint256 _rate,
		uint256 _maturityInWeeks,
		PositionMetaData memory _data
	) public {
		require(hasRole(WHITELIST_BOND_STORAGE, msg.sender), "invalid-user");
		uint256 timeNow = block.timestamp;

		uint256 maturityDate = maturityDateAfterWeeks(_maturityInWeeks);
		Bond memory bond = Bond(_principal, _rate, maturityDate, _data);

		if (!isInitialised(_user)) {
			setActive(_user);
			setInitialised(_user);
		}
		addBond(_user, bond);
		incrementActiveBonds(_user);
	}

	// Refreshes the bonds of a user.
	// When calling this function:
	// If the user is not already in the system, it is not initialised.
	// If the user adds a bond for the first time, it is both initialised and active.
	// If the user has no bond that has passed its maturity, nothing changes.
	// If the user has at least one bond that has passed maturity, the amountBondsActive is
	// subtracted with the appropriate amount and credit counter is increased with the
	// principal(s) and the accrued interest.
	// If the user has no bonds active, the isActive will be switched to false.
	function refreshBond(address _user) public {
		uint256 current = block.timestamp;
		//TODO
	}

	function maturityDateAfterWeeks(uint256 _maturityInWeeks) private returns (uint256) {
		uint256 current = block.timestamp;
		uint256 secondsPerWeek = 1 weeks; // 7 * 24 * 60 * 60
		return current + _maturityInWeeks * secondsPerWeek;
	}
}
