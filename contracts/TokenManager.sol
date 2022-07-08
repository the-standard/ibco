//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenManager is Ownable {

    mapping(bytes32 => Token) private tokens;
    bytes32[] tokenNames;

    struct Token {
        address addr;
        address chainlinkAddr;
        uint8 chainlinkDec;
    }

    constructor(address _wethAddress, address _ethUsdCL, uint8 _ethUsdCLDec) {
        addAcceptedTokens(_wethAddress, _ethUsdCL, _ethUsdCLDec);
    }

    function get(bytes32 _name) external view returns(address addr, address chainlinkAddr, uint8 chainlinkDec) {
        Token memory token = tokens[_name];
        return (token.addr, token.chainlinkAddr, token.chainlinkDec);
    }

    function addAcceptedTokens(address _wethAddress, address _ethUsdCL, uint8 _ethUsdCLDec) private {
        addAcceptedToken(bytes32("WETH"), _wethAddress, _ethUsdCL, _ethUsdCLDec);
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
