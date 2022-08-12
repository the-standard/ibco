//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "contracts/Stage2/BondStorage.sol";
import "contracts/Stage2/BondingEvent.sol";
import "contracts/Pausable.sol";

import "hardhat/console.sol";

contract OperatorStage2 is AccessControl, Pausable {
    bytes32 public constant OPERATOR_STAGE_2 = keccak256("OPERATOR_STAGE_2");

    // BondStorage dependency
    BondStorage public bondStorage;

    // BondingEvent dependency
    BondingEvent public bondingEvent;

    struct BondRate { uint256 rate; uint256 durationInWeeks; }

    // Save the rates added
    BondRate[] ratesAvailable;
    // Emit an event when a new yield is added
    event Yield(uint256 indexed rate, uint256 indexed durationInWeeks);

    constructor() {
        _setupRole(OPERATOR_STAGE_2, msg.sender);
        // default rate 2% over a year
        addRate(2000, 52);
    }

    modifier onlyOperatorStage2() { require(hasRole(OPERATOR_STAGE_2, msg.sender), "err-invalid-sender"); _; }

    function setStorage(address _newAddress) public onlyOperatorStage2 {
        require(_newAddress != address(bondStorage), "err-same-address");
        bondStorage = BondStorage(_newAddress);
    }

    function setBonding(address _newAddress) public onlyOperatorStage2 {
        require(_newAddress != address(bondingEvent), "err-same-address");
        bondingEvent = BondingEvent(_newAddress);
    }

    // Adds a new rate that allows a user to bond with
    function addRate(uint256 _rate, uint256 _maturityInWeeks) public onlyOperatorStage2 {
        ratesAvailable.push(BondRate(_rate, _maturityInWeeks));
        emit Yield(_rate, _maturityInWeeks);
    }

    function getBondRate(uint256 _rate) private view returns (BondRate memory rate, uint256 index) {
        for (; index < ratesAvailable.length; index++) if (ratesAvailable[index].rate == _rate) return (ratesAvailable[index], index);
        revert("err-rate-not-found");
    }

    function removeRate(uint256 _rate) public onlyOperatorStage2 {
        // delete rate from available rates without caring for order
        // so sorting may be required on the frontend
        // copy last rate to deleted item's such that there is a duplicate of it
        (,uint256 rateIndex) = getBondRate(_rate);
        ratesAvailable[rateIndex] = ratesAvailable[ratesAvailable.length - 1];
        ratesAvailable.pop();

        emit Yield(_rate, 0);
    }

    // Displays all the rates available as pairs of (rate, duration)
    function showRates() public view returns (BondRate[] memory) { return ratesAvailable; }

    function newBond(uint256 _amountSeuro, uint256 _rate) public ifNotPaused {
        (BondRate memory bondRate,) = getBondRate(_rate);
        bondingEvent.bond(msg.sender, _amountSeuro, bondRate.durationInWeeks, _rate);
    }
}
