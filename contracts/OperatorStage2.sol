//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "contracts/BondStorage.sol";
import "contracts/BondingEvent.sol";
import "contracts/StandardTokenGateway.sol";

contract OperatorStage2 is AccessControl {
	bytes32 public constant OPERATOR_STAGE_2 = keccak256("OPERATOR_STAGE_2");

	// BondStorage dependency
	BondStorage public bondStorage;

	// BondingEvent dependency
	BondingEvent public bondingEvent;

	// StandardTokenGateway dependency
	StandardTokenGateway public tokenGateway;

	struct BondRate {
		uint256 rate;
		uint256 durationInWeeks;
	}

	// Specifies which (rates -> maturities) a user are allowed to bond
	mapping(uint256 => uint256) allowedYieldToWeeks;
	// Save the rates added
	BondRate[] ratesAvailable;
	// Emit an event when a new yield is added
	event Yield(uint256 indexed rate, uint256 indexed durationInWeeks);

	constructor() {
		_setupRole(OPERATOR_STAGE_2, msg.sender);

		// basic rate
		uint256 twoPercent = 2000;
		uint256 oneYearInWeeks = 52;
		addRate(twoPercent, oneYearInWeeks);
	}

	modifier onlyOperatorStage2 {
		require(hasRole(OPERATOR_STAGE_2, msg.sender), "err-invalid-sender");
		_;
	}

	function setStorage(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != address(bondStorage), "err-same-address");
		bondStorage = BondStorage(_newAddress);
	}

	function setBonding(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != address(bondingEvent), "err-same-address");
		bondingEvent = BondingEvent(_newAddress);
	}

	function setGateway(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != address(tokenGateway), "err-same-address");
		tokenGateway = StandardTokenGateway(_newAddress);
	}

	// Adds a new rate that allows a user to bond with
	function addRate(uint256 _rate, uint256 _maturityInWeeks) public onlyOperatorStage2 {
		allowedYieldToWeeks[_rate] = _maturityInWeeks;
		BondRate memory br = BondRate(_rate, _maturityInWeeks);
		ratesAvailable.push(br);
		emit Yield(_rate, _maturityInWeeks);
	}

	function findIndexOfItem(uint256 _item) private view returns(bool, uint256) {
		for(uint256 i=0; i < ratesAvailable.length; i++) {
			if (ratesAvailable[i].rate == _item) {
				return (true, i);
			}
		}
		return (false, 0);
	}

	// Sets a rate to zero, not removing it but making it obsolete
	function removeRate(uint256 _rate) public onlyOperatorStage2 {
		// invalidate duration for this yield in lookup, rendering it
		// impossible to bond for this rate
		allowedYieldToWeeks[_rate] = 0;

		// delete rate from available rates without caring for order
		// so sorting may be required on the frontend
		(bool ok, uint256 ind) = findIndexOfItem(_rate);
		require(ok == true, 'err-rate-not-found');
		// copy last rate to deleted item's such that there is a duplicate of it
		ratesAvailable[ind] = ratesAvailable[ratesAvailable.length - 1];
		ratesAvailable.pop();

		emit Yield(_rate, 0);
	}

	// Displays all the rates available as pairs of (rate, duration)
	function showRates() public view returns(BondRate[] memory) {
		return ratesAvailable;
	}

	function newBond(
		uint256 _amountSeuro,
		uint256 _rate
	) public {
		uint256 wks = allowedYieldToWeeks[_rate];
		require(wks > 0, "err-missing-rate");
		bondingEvent.bond(msg.sender, _amountSeuro, wks, _rate);
	}

	function refreshBond(address _user) public {
		bondStorage.refreshBondStatus(_user);
	}

	function claim() public {
		bondStorage.claimReward(msg.sender);
	}
}
