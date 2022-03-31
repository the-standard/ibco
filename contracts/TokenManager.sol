//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenManager is Ownable {
    address public constant WETH_ADDRESS =  0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant ETH_USD_CHAINLINK = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
    address public constant EUR_USD_CHAINLINK = 0xb49f677943BC038e9857d61E7d053CaA2C1734C1;

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

    function addAcceptedTokens() private {
        addAcceptedToken(bytes32("WETH"), WETH_ADDRESS, ETH_USD_CHAINLINK, 8);
    }

    function getAcceptedTokens() public view returns (bytes32[] memory) {
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