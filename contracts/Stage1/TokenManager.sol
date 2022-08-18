//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenManager is Ownable {

    bytes32 private constant WETH_NAME = bytes32("WETH");
    uint8 private constant WETH_DEC = 18;

    Token[] public tokens;

    struct Token { string symbol; address addr; uint8 dec; address chainlinkAddr; uint8 chainlinkDec; }

    /// @param _wethAddress address of WETH token
    /// @param _ethUsdCL address of Chainlink data feed for ETH / USD
    /// @param _ethUsdCLDec number of decimals that ETH / USD data feed uses
    constructor(address _wethAddress, address _ethUsdCL, uint8 _ethUsdCLDec) {
        addDefaultTokens(_wethAddress, _ethUsdCL, _ethUsdCLDec);
    }

    // Gets the details for the given token, if it is accepted
    /// @param _symbol The token symbol e.g. "WETH", "USDC", "USDT"
    function get(string memory _symbol) external view returns(Token memory token) {
        for (uint256 i = 0; i < tokens.length; i++) if (cmpString(tokens[i].symbol, _symbol)) token = tokens[i];
        require(bytes(token.symbol).length > 0, "err-tok-not-found");
    }

    function addDefaultTokens(address _wethAddress, address _ethUsdCL, uint8 _ethUsdCLDec) private {
        addAcceptedToken("WETH", _wethAddress, WETH_DEC, _ethUsdCL, _ethUsdCLDec);
    }

    // Get an array of all the accepted tokens
    function getAcceptedTokens() external view returns (Token[] memory) {
        return tokens;
    }

    // Add a token to the accepted list of tokens
    /// @param _symbol The token symbol e.g. "WETH", "USDT"
    /// @param _addr the address of the token
    /// @param _dec the decimals of the token
    /// @param _chainlinkAddr the address of the token / USD Chainlink data feed
    /// @param _chainlinkDec the number of decimals the Chainlink data feed uses
    function addAcceptedToken(string memory _symbol, address _addr, uint8 _dec, address _chainlinkAddr, uint8 _chainlinkDec) public onlyOwner {
        //TODO: only receive the address and then fetch the symbol and decimals
        tokens.push(Token(_symbol, _addr, _dec, _chainlinkAddr, _chainlinkDec));
    }

    function deleteToken(uint256 index) private {
        for (uint256 i = index; i < tokens.length - 1; i++) tokens[i] = tokens[i+1];
        tokens.pop();
    }

    // Remove accepted token from accepted list of tokens
    /// @param _symbol The token symbol e.g. "WETH", "USDT"
    function removeAcceptedToken(string memory _symbol) public onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) if (cmpString(tokens[i].symbol, _symbol)) deleteToken(i);
    }

    function cmpString(string memory a, string memory b) private pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
}
