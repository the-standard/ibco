//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenManager is Ownable {

    bytes32 private WETH_NAME = bytes32("WETH");
    uint8 private WETH_DEC = 18;

    mapping(bytes32 => Token) private tokens;
    bytes32[] tokenNames;

    struct Token {
        address addr;
        uint8 dec;
        address chainlinkAddr;
        uint8 chainlinkDec;
    }

    /// @param _wethAddress address of WETH token
    /// @param _ethUsdCL address of Chainlink data feed for ETH / USD
    /// @param _ethUsdCLDec number of decimals that ETH / USD data feed uses
    constructor(address _wethAddress, address _ethUsdCL, uint8 _ethUsdCLDec) {
        addDefaultTokens(_wethAddress, _ethUsdCL, _ethUsdCLDec);
    }

    // Gets the details for the given token, if it is accepted
    /// @param _name 32-byte array value representation of the token symbol e.g. "WETH", "USDT"
    function get(bytes32 _name) external view returns(Token memory) {
        return tokens[_name];
    }

    function addDefaultTokens(address _wethAddress, address _ethUsdCL, uint8 _ethUsdCLDec) private {
        addAcceptedToken(WETH_NAME, _wethAddress, WETH_DEC, _ethUsdCL, _ethUsdCLDec);
    }

    // Get an array of all the 32-byte arrays that represent accepted tokens
    function getAcceptedTokens() external view returns (bytes32[] memory) {
        return tokenNames;
    }

    // Add a token to the accepted list of tokens
    /// @param _name 32-byte array value representation of the token symbol e.g. "WETH", "USDT"
    /// @param _addr the address of the token
    /// @param _dec the decimals of the token
    /// @param _chainlinkAddr the address of the token / USD Chainlink data feed
    /// @param _chainlinkDec the number of decimals the Chainlink data feed uses
    function addAcceptedToken(bytes32 _name, address _addr, uint8 _dec, address _chainlinkAddr, uint8 _chainlinkDec) public onlyOwner {
        tokens[_name] = Token(_addr, _dec, _chainlinkAddr, _chainlinkDec);
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
