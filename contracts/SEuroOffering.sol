//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "contracts/interfaces/WETH.sol";
import "contracts/SEuro.sol";
import "contracts/SEuroCalculator.sol";
import "contracts/TokenManager.sol";
import "contracts/BondingCurve.sol";
import "contracts/Pausable.sol";

contract SEuroOffering is Ownable, Pausable {
    // address of the wallet which will receive the collateral provided in swap and swapETH
    address public collateralWallet;
    Status public status;
    SEuro public immutable Seuro;
    SEuroCalculator public sEuroRateCalculator;    
    TokenManager public tokenManager;
    BondingCurve public bondingCurve;

    event Swap(bytes32 _token, uint256 amountIn, uint256 amountOut);
    struct Status { bool active; uint256 start; uint256 stop; }

    /// @param _seuroAddr address of sEURO token
    /// @param _sEuroRateCalculator address of SEuroRateCalculator contract
    /// @param _tokenManager address of TokenManager contract
    /// @param _bondingCurve address of BondingCurve contract
    constructor(address _seuroAddr, address _sEuroRateCalculator, address _tokenManager, address _bondingCurve) {
        Seuro = SEuro(_seuroAddr);
        sEuroRateCalculator = SEuroCalculator(_sEuroRateCalculator);
        tokenManager = TokenManager(_tokenManager);
        bondingCurve = BondingCurve(_bondingCurve);
    }

    modifier ifActive() { require(activated() && notEnded(), "err-ibco-inactive"); _; }

    modifier validAddress(address _newAddress) { require(_newAddress != address(0), "err-addr-invalid"); _; }

    function setCalculator(address _newAddress) external onlyOwner validAddress(_newAddress) {
        sEuroRateCalculator = SEuroCalculator(_newAddress);
    }

    function setTokenManager(address _newAddress) external onlyOwner validAddress(_newAddress) {
        tokenManager = TokenManager(_newAddress);
    }

    function setBondingCurve(address _newAddress) external onlyOwner validAddress(_newAddress) {
        bondingCurve = BondingCurve(_newAddress);
    }

    function getSeuros(uint256 _amount, TokenManager.Token memory _token) private returns (uint256) {
        return sEuroRateCalculator.calculate(_amount, _token);
    }

    function activated() private view returns (bool) { return status.active == true && status.start > 0; }

    function notEnded() private view returns (bool) { return status.stop == 0 || status.stop > block.timestamp; }

    function transferCollateral(IERC20 _token, uint256 _amount) private {
        if (collateralWallet != address(0)) _token.transfer(collateralWallet, _amount);
    }

    // A read-only function to estimate how much sEURO would be received for the given amount of token
    // This function provides a simplified calculation and is therefore just an estimation
    // Provide a 32-byte array of "WETH" to estimate the exchange for ETH
    /// @param _token byte array value for the token that you'd like to estimate the exchange value for
    /// @param _amount the amount of the given token that you'd like to estimate the exchange value for
    function readOnlyCalculateSwap(bytes32 _token, uint256 _amount) external view returns (uint256) {
        if (_token == bytes32("ETH")) _token = bytes32("WETH");
        return sEuroRateCalculator.readOnlyCalculate(_amount, tokenManager.get(_token));
    }

    // Swap any accepted ERC20 token for an equivalent amount of sEURO
    // Accepted tokens and their byte array values are dictated by the TokenManager contract
    /// @param _token byte array value for the token that you'd like to exchange
    /// @param _amount the amount of the given token that you'd like to exchange for sEURO
    function swap(bytes32 _token, uint256 _amount) external ifActive ifNotPaused {
        TokenManager.Token memory token = tokenManager.get(_token);
        IERC20 erc20Token = IERC20(token.addr);
        require(erc20Token.balanceOf(msg.sender) >= _amount, "err-tok-bal");
        require(erc20Token.allowance(msg.sender, address(this)) >= _amount, "err-tok-allow");
        erc20Token.transferFrom(msg.sender, address(this), _amount);
        uint256 seuros = getSeuros(_amount, token);
        Seuro.mint(msg.sender, seuros);
        bondingCurve.updateCurrentBucket(seuros);
        transferCollateral(erc20Token, _amount);
        emit Swap(_token, _amount, seuros);
    }

    // Payable function that exchanges the ETH value of the transaction for an equivalent amount of sEURO
    function swapETH() external payable ifActive ifNotPaused {
        TokenManager.Token memory token = tokenManager.get(bytes32("WETH"));
        WETH(token.addr).deposit{value: msg.value}();
        uint256 seuros = getSeuros(msg.value, token);
        Seuro.mint(msg.sender, seuros);
        bondingCurve.updateCurrentBucket(seuros);
        transferCollateral(IERC20(token.addr), msg.value);
        emit Swap(bytes32("ETH"), msg.value, seuros);
    }

    // Restricted function to activate the sEURO Offering
    function activate() external onlyOwner {
        status.active = true;
        status.start = block.timestamp;
    }

    // Restricted function to complete the sEURO Offering
    function complete() external onlyOwner {
        status.active = false;
        status.stop = block.timestamp;
    }

    // Sets the wallet that will receive all collateral exchanged for sEURO
    function setCollateralWallet(address _collateralWallet) external onlyOwner { collateralWallet = _collateralWallet; }
}
