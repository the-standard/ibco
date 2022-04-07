//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenManager is Ownable {
    address public constant WETH_ADDRESS =  0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address public constant ETH_USD_CHAINLINK = 0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D;
    uint8 public constant ETH_USD_DEC = 8;

    mapping(bytes32 => Token) private tokens;
    bytes32[] tokenNames;

    struct Token {
        address addr;
        address chainlinkAddr;
        uint8 chainlinkDec;
    }
        
    constructor() {
        addAcceptedTokens();
    }

    function get(bytes32 _name) external view returns(address addr, address chainlinkAddr, uint8 chainlinkDec) {
        Token memory token = tokens[_name];
        return (token.addr, token.chainlinkAddr, token.chainlinkDec);
    }

    function addAcceptedTokens() private {
        addAcceptedToken(bytes32("WETH"), WETH_ADDRESS, ETH_USD_CHAINLINK, ETH_USD_DEC);
    }

    function getAcceptedTokens() external view returns (bytes32[] memory) {
        return tokenNames;
    }

    function addAcceptedToken(bytes32 _name, address _addr, address _chainlinkAddr, uint8 _chainlinkDec) public onlyOwner {
        tokens[_name] = Token(_addr, _chainlinkAddr, _chainlinkDec);
        tokenNames.push(_name);
    }

    function deleteTokenName(uint256 index) private {
        for (uint256 i = index; i < tokenNames.length - 1; i++) {
            tokenNames[i] = tokenNames[i+1];
        }
        tokenNames.pop();
    }

    function removeAcceptedToken(bytes32 _name) public onlyOwner {
        for (uint256 i = 0; i < tokenNames.length; i++) {
            if (tokenNames[i] == _name) {
                deleteTokenName(i);
            }
        }
        delete tokens[_name];
    }
}