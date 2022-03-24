//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract IBCO is Ownable {
    event Swap();

    // mapping(string => address) tokens; //
    // Token[] tokens;

    struct Token {
        string name;
    }

    constructor() {

    }

    function swap(bytes32 _token, uint _amount) public {
        // check given token
        // transferFrom(msg.sender, _amount)
        // chainlink:
        //   get dollar price for token
        //   get eur price for dollar
        // apply token & discount rate
        // mint euros to msg.sender
        // emit swap event
    }

    function swapETH() external payable {
        // convert given eth to weth
        // call swap()
    }

    function getAcceptedTokens() public view returns (Token[] memory tokens) {
        // show all the tokens
    }

    function addAcceptedToken(address _token, bytes32 _name) public onlyOwner {
        // blah
    }

    function removeAcceptedToken(bytes32 _name) public onlyOwner {
        // blah
    }

    function chainlink(address _token) private returns (uint256 rate) {
        // get dollar price for token
        // get eur price for dollar
    }

    function currentDiscount() public returns (uint256 discountRate) {
        // get the current seuro discount based on curve
        // is it time ?! is it volume ?! watch this space
    }
}