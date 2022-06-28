//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "contracts/interfaces/Chainlink.sol";
import "contracts/interfaces/WETH.sol";
import "contracts/SEuro.sol";
import "contracts/SEuroCalculator.sol";
import "contracts/TokenManager.sol";
import "contracts/BondingCurve.sol";

contract SEuroOffering is Ownable {
    bool private active;
    uint256 private start;
    uint256 private stop;
    address private seuro;
    SEuroCalculator private sEuroRateCalculator;    
    TokenManager private tokenManager;
    BondingCurve private bondingCurve;

    event Swap(bytes32 _token, uint256 amountIn, uint256 amountOut);

    constructor(address _seuro, address _sEuroRateCalculator, address _tokenManager, address _bondingCurve) {
        seuro = _seuro;
        sEuroRateCalculator = SEuroCalculator(_sEuroRateCalculator);
        tokenManager = TokenManager(_tokenManager);
        bondingCurve = BondingCurve(_bondingCurve);
    }

    function getEuros(uint256 _amount, address _chainlinkAddr, uint8 _chainlinkDec) private returns (uint256) {
        return sEuroRateCalculator.calculate(_amount, _chainlinkAddr, _chainlinkDec);
    }

    function activated() private view returns (bool) {
        return active == true && start > 0;
    }

    function notEnded() private view returns (bool) {
        return stop == 0 || stop > block.timestamp;
    }

    modifier ifActive() {
        bool isActive = activated() && notEnded();
        require(isActive, "err-ibco-inactive");
        _;
    }

    function swap(bytes32 _token, uint256 _amount) external ifActive {
        (address addr, address chainlinkAddr, uint8 chainlinkDec) = tokenManager.get(_token);
        IERC20 token = IERC20(addr);
        require(token.balanceOf(msg.sender) >= _amount, "err-tok-bal");
        require(token.allowance(msg.sender, address(this)) >= _amount, "err-tok-allow");
        token.transferFrom(msg.sender, address(this), _amount);
        uint256 euros = getEuros(_amount, chainlinkAddr, chainlinkDec);
        SEuro(seuro).mint(msg.sender, euros);
        bondingCurve.updateCurrentBucket();
        emit Swap(_token, _amount, euros);
    }

    function swapETH() external payable ifActive {
        (address addr, address chainlinkAddr, uint8 chainlinkDec) = tokenManager.get(bytes32("WETH"));
        WETH weth = WETH(addr);
        weth.deposit{value: msg.value};
        uint256 euros = getEuros(msg.value, chainlinkAddr, chainlinkDec);
        SEuro(seuro).mint(msg.sender, euros);
        bondingCurve.updateCurrentBucket();
        emit Swap(bytes32("ETH"), msg.value, euros);
    }

    function getStatus() external view returns (bool _active, uint256 _start, uint256 _stop) {
        return (active, start, stop);
    }

    function activate() external onlyOwner {
        active = true;
        start = block.timestamp;
    }

    function complete() external onlyOwner {
        active = false;
        stop = block.timestamp;
    }
}
