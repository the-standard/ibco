//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "contracts/BondStorage.sol";
import "contracts/BondingEvent.sol";
import "contracts/StandardTokenGateway.sol";

contract OperatorStage2 is AccessControl {
	bytes32 public constant OPERATOR_STAGE_2 = keccak256("OPERATOR_STAGE_2");

	// BondStorage contract address
	address public storageAddress;
	BondStorage bondStorage;

	// BondingEvent contract
	address public eventAddress;
	BondingEvent bondingEvent;

	// StandardTokenGateway contract
	address public gatewayAddress;
	StandardTokenGateway tokenGateway;

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
		require(_newAddress != storageAddress, "err-same-address");
		storageAddress = _newAddress;
		bondStorage = BondStorage(storageAddress);
	}

	function setBonding(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != eventAddress, "err-same-address");
		eventAddress = _newAddress;
		bondingEvent = BondingEvent(eventAddress);
	}

	function setGateway(address _newAddress) public onlyOperatorStage2 {
		require(_newAddress != gatewayAddress, "err-same-address");
		gatewayAddress = _newAddress;
		tokenGateway = StandardTokenGateway(gatewayAddress);
	}

	// Adds a new rate that allows a user to bond with
	function addRate(uint256 _rate, uint256 _maturityInWeeks) public onlyOperatorStage2 {
		allowedYieldToWeeks[_rate] = _maturityInWeeks;
		BondRate memory br = BondRate(_rate, _maturityInWeeks);
		ratesAvailable.push(br);
		emit Yield(_rate, _maturityInWeeks);
	}

	// Sets a rate to zero, not removing it but making it obsolete
	// TODO: make this nicer and not just bond for 0% yield
	function removeRate(uint256 _rate) public onlyOperatorStage2 {
		allowedYieldToWeeks[_rate] = 0;
		emit Yield(_rate, 0);
	}

	// Displays all the rates available as pairs of (rate, duration)
	function showRates() public view returns(BondRate[] memory) {
		return ratesAvailable;
	}

	function newBond(
		address _user,
		uint256 _amountSeuro,
		uint256 _weeks,
		uint256 _rate
	) public {
		require(allowedYieldToWeeks[_rate] > 0, "err-missing-rate");
		bondingEvent.bond(_user, _amountSeuro, _weeks, _rate);
	}

	function refreshBond(address _user) public {
		bondStorage.refreshBondStatus(_user);
	}

	function claim() public {
		bondStorage.claimReward(msg.sender);
	}
}
