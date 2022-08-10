//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "contracts/interfaces/WETH.sol";
import "contracts/SEuro.sol";
import "contracts/SEuroCalculator.sol";
import "contracts/TokenManager.sol";
import "contracts/BondingCurve.sol";

contract SEuroOffering is Ownable {
    // address of the wallet which will receive the collateral provided in swap and swapETH
    address public collateralWallet;

    bool private active;
    uint256 private start;
    uint256 private stop;
    address private seuro;
    SEuroCalculator private sEuroRateCalculator;    
    TokenManager private tokenManager;
    BondingCurve private bondingCurve;

    event Swap(bytes32 _token, uint256 amountIn, uint256 amountOut);

    /// @param _seuro address of sEURO token
    /// @param _sEuroRateCalculator address of SEuroRateCalculator contract
    /// @param _tokenManager address of TokenManager contract
    /// @param _bondingCurve address of BondingCurve contract
    constructor(address _seuro, address _sEuroRateCalculator, address _tokenManager, address _bondingCurve) {
        seuro = _seuro;
        sEuroRateCalculator = SEuroCalculator(_sEuroRateCalculator);
        tokenManager = TokenManager(_tokenManager);
        bondingCurve = BondingCurve(_bondingCurve);
    }

    modifier ifActive() {
        bool isActive = activated() && notEnded();
        require(isActive, "err-ibco-inactive");
        _;
    }

    function getEuros(uint256 _amount, TokenManager.Token memory _token) private returns (uint256) {
        return sEuroRateCalculator.calculate(_amount, _token);
    }

    function activated() private view returns (bool) {
        return active == true && start > 0;
    }

    function notEnded() private view returns (bool) {
        return stop == 0 || stop > block.timestamp;
    }

    function transferCollateral(IERC20 _token, uint256 _amount) private {
        if (collateralWallet != address(0)) {
            _token.transfer(collateralWallet, _amount);
        }
    }

    // A read-only function to estimate how much sEURO would be received for the given amount of token
    // This function provides a simplified calculation and is therefore just an estimation
    // Provide a 32-byte array of "WETH" to estimate the exchange for ETH
    /// @param _token byte array value for the token that you'd like to estimate the exchange value for
    /// @param _amount the amount of the given token that you'd like to estimate the exchange value for
    function readOnlyCalculateSwap(bytes32 _token, uint256 _amount) external view returns (uint256) {
        if (_token == bytes32("ETH")) _token = bytes32("WETH");
        TokenManager.Token memory token = tokenManager.get(_token);
        return sEuroRateCalculator.readOnlyCalculate(_amount, token);
    }

    // Swap any accepted ERC20 token for an equivalent amount of sEURO
    // Accepted tokens and their byte array values are dictated by the TokenManager contract
    /// @param _token byte array value for the token that you'd like to exchange
    /// @param _amount the amount of the given token that you'd like to exchange for sEURO
    function swap(bytes32 _token, uint256 _amount) external ifActive {
        TokenManager.Token memory token = tokenManager.get(_token);
        IERC20 erc20Token = IERC20(token.addr);
        require(erc20Token.balanceOf(msg.sender) >= _amount, "err-tok-bal");
        require(erc20Token.allowance(msg.sender, address(this)) >= _amount, "err-tok-allow");
        erc20Token.transferFrom(msg.sender, address(this), _amount);
        uint256 euros = getEuros(_amount, token);
        SEuro(seuro).mint(msg.sender, euros);
        bondingCurve.updateCurrentBucket(euros);
        transferCollateral(erc20Token, _amount);
        emit Swap(_token, _amount, euros);
    }

    // Payable function that exchanges the ETH value of the transaction for an equivalent amount of sEURO
    function swapETH() external payable ifActive {
        uint256 amount = msg.value;
        TokenManager.Token memory token = tokenManager.get(bytes32("WETH"));
        WETH weth = WETH(token.addr);
        weth.deposit{value: amount}();
        uint256 euros = getEuros(amount, token);
        SEuro(seuro).mint(msg.sender, euros);
        bondingCurve.updateCurrentBucket(euros);
        transferCollateral(IERC20(token.addr), amount);
        emit Swap(bytes32("ETH"), amount, euros);
    }

    // Payable function that exchanges the ETH value of the transaction for an equivalent amount of sEURO
    /// @return _active indicates whether the sEURO Offering is currently active
    /// @return _start UNIX timestamp of when the sEURO Offering was activated
    /// @return _stop UNIX timestamp of when the sEURO Offering was completed
    function getStatus() external view returns (bool _active, uint256 _start, uint256 _stop) {
        return (active, start, stop);
    }

    // Restricted function to activate the sEURO Offering
    function activate() external onlyOwner {
        active = true;
        start = block.timestamp;
    }

    // Restricted function to complete the sEURO Offering
    function complete() external onlyOwner {
        active = false;
        stop = block.timestamp;
    }

    // Sets the wallet that will receive all collateral exchanged for sEURO
    function setCollateralWallet(address _collateralWallet) external onlyOwner {
        collateralWallet = _collateralWallet;
    }
}
