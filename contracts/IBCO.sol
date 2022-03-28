//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "contracts/interfaces/Chainlink.sol";
import "contracts/interfaces/WETH.sol";
import "contracts/BondingCurve.sol";
import "contracts/SEuro.sol";

contract IBCO is Ownable {
    address public constant WETH_ADDRESS =  0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant ETH_USD_CHAINLINK = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
    address public constant EUR_USD_CHAINLINK = 0xb49f677943BC038e9857d61E7d053CaA2C1734C1;

    address private seuro;
    address private bondingCurve;

    event Swap(bytes32 _token, uint256 amountIn, uint256 amountOut);

    mapping(bytes32 => Token) tokens;

    struct Token {
        address addr;
        address chainlinkAddr;
        uint8 chainlinkDec;
    }

    constructor(address _seuro, address _bondingCurve) {
        seuro = _seuro;
        bondingCurve = _bondingCurve;
        tokens[bytes32("EUR")] = Token(_seuro, EUR_USD_CHAINLINK, 8);
        addAcceptedTokens();
    }

    function addAcceptedTokens() private {
        tokens[bytes32("WETH")] = Token(WETH_ADDRESS, ETH_USD_CHAINLINK, 8);
    }

    function getEuroRate(bytes32 _token) private view returns (uint256 rate) {
        Token memory token = tokens[_token];
        Token memory euro = tokens[bytes32("EUR")];
        (,int256 tokUsd,,,) = Chainlink(token.chainlinkAddr).latestRoundData();
        (,int256 eurUsd,,,) = Chainlink(euro.chainlinkAddr).latestRoundData();
        rate = uint256(tokUsd) / uint256(eurUsd) / 10 ** (token.chainlinkDec - euro.chainlinkDec);
    }

    function getDiscountRate() private view returns (uint256) {
        return BondingCurve(bondingCurve).getDiscount();
    }

    function swap(bytes32 _token, uint256 _amount) public {
        IERC20 token = IERC20(tokens[_token].addr);
        // these two requirements are slightly unnecessary
        // because function will revert on the transfer anyway
        // but it does give more visible errors 🤷🏻‍♂️
        require(token.balanceOf(msg.sender) >= _amount, "token balance too low");
        require(token.allowance(msg.sender, address(this)) >= _amount, "transfer allowance not approved");
        token.transferFrom(msg.sender, address(this), _amount);
        uint256 euros = _amount * getEuroRate(_token) / getDiscountRate() * 100 / 1 ether;
        SEuro(tokens[bytes32("EUR")].addr).mint(msg.sender, euros);
        emit Swap(_token, _amount, euros);
    }

    function swapETH() external payable {
        WETH weth = WETH(WETH_ADDRESS);
        weth.deposit{value: msg.value};
        uint256 euros = msg.value * getEuroRate(bytes32("WETH")) / getDiscountRate() * 100 / 1 ether;
        SEuro(tokens[bytes32("EUR")].addr).mint(msg.sender, euros);
        emit Swap(bytes32("ETH"), msg.value, euros);
    }

    // function getAcceptedTokens() public view returns (Token[] memory acceptedTokens) {
    //     // show all the tokens
    // }

    function addAcceptedToken(address _token, bytes32 _name) public onlyOwner {
        // blah
    }

    function removeAcceptedToken(bytes32 _name) public onlyOwner {
        // blah
    }

    function chainlink(bytes32 _token) private returns (uint256 rate) {
        // get dollar price for token
        // get eur price for dollar
    }

    function currentDiscount() public returns (uint256 discountRate) {
        // get the current seuro discount based on curve
        // is it time ?! is it volume ?! watch this space
    }
}
