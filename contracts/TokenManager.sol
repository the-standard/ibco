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
        addDefaultTokens(_wethAddress, _ethUsdCL, _ethUsdCLDec);
    }

    // Gets the details for the given token, if it is accepted
    /// @param _name 32-byte array value representation of the token symbol e.g. "WETH", "USDT"
    /// @return addr the address of the token
    /// @return chainlinkAddr the address of the token / USD Chainlink data feed
    /// @return chainlinkDec the number of decimals the Chainlink data feed uses
    function get(bytes32 _name) external view returns(address addr, address chainlinkAddr, uint8 chainlinkDec) {
        Token memory token = tokens[_name];
        return (token.addr, token.chainlinkAddr, token.chainlinkDec);
    }

    function addDefaultTokens(address _wethAddress, address _ethUsdCL, uint8 _ethUsdCLDec) private {
        addAcceptedToken(bytes32("WETH"), _wethAddress, _ethUsdCL, _ethUsdCLDec);
    }

    // Get an array of all the 32-byte arrays that represent accepted tokens
    function getAcceptedTokens() external view returns (bytes32[] memory) {
        return tokenNames;
    }

    // Add a token to the accepted list of tokens
    /// @param _name 32-byte array value representation of the token symbol e.g. "WETH", "USDT"
    /// @param _addr the address of the token
    /// @param _chainlinkAddr the address of the token / USD Chainlink data feed
    /// @param _chainlinkDec the number of decimals the Chainlink data feed uses
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

    // Remove accepted token from accepted list of tokens
    /// @param _name 32-byte array value representation of the token symbol e.g. "WETH", "USDT"
    function removeAcceptedToken(bytes32 _name) public onlyOwner {
        for (uint256 i = 0; i < tokenNames.length; i++) {
            if (tokenNames[i] == _name) {
                deleteTokenName(i);
            }
        }
        delete tokens[_name];
    }
}
