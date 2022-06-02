//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract BondingEvent {
	// sEUR: the main leg of the currency pair
	address public immutable standardEuroContract;
	// the other leg which has to be erc20 comptabile
	address public immutable erc20compatible;
	// the address of the liquidity pool
	address public pool;
	// minimum currency amount
	uint256 public immutable MIN_VAL = 0;

	// uniswap: creates bond
	INonfungiblePositionManager private immutable manager;
	// https://docs.uniswap.org/protocol/reference/core/libraries/Tick
	int24 public tickSpacing;
	int24 private constant TICK_LOWER = -887270;
	int24 private constant TICK_UPPER = 887270;
	uint24 private fee; // should the fee really be private?

	// store array of liquidity token IDs (received after successful bond)
	uint256[] private positionIDs;

	constructor(address _sEuro, address _otherToken, address _manager) {
		standardEuroContract = _sEuro;
		erc20compatible = _otherToken;
		manager = INonfungiblePositionManager(_manager);
	}

	/// TODO SIMON
	function getLowestFirst() private view returns (address token0, address token1) {
		(token0, token1) = standardEuroContract < erc20compatible
			? (standardEuroContract, erc20compatible)
			: (erc20compatible, standardEuroContract);
	}

	/// @notice Parameter `_price` is in sqrtPriceX96 format
	function initialisePool(uint160 _price, uint24 _fee) external {
		(address token0, address token1) = getLowestFirst();
		fee = _fee;
		pool = manager.createAndInitializePoolIfNecessary(
			token0,
			token1,
			_fee,
			_price
		);
		tickSpacing = IUniswapV3Pool(pool).tickSpacing();
	}

	function validTicks() private view returns (bool) {
		return TICK_LOWER % tickSpacing == 0 && TICK_UPPER % tickSpacing == 0;
	}

	function bond(uint256 _amountSeuro, uint256 _amountOther) public {
		TransferHelper.safeTransferFrom(standardEuroContract, msg.sender, address(this), _amountSeuro);
		TransferHelper.safeTransferFrom(erc20compatible, msg.sender, address(this), _amountOther);
		TransferHelper.safeApprove(standardEuroContract, address(manager), _amountSeuro);
		TransferHelper.safeApprove(erc20compatible, address(manager), _amountOther);

		(address token0, address token1) = getLowestFirst();
		// not sure why the full amount of seuro can't be added
		uint256 minSeuro = _amountSeuro - 1 ether;
		(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
			token0 == standardEuroContract ?
			(_amountSeuro, _amountOther, minSeuro, MIN_VAL) :
			(_amountOther, _amountSeuro, MIN_VAL, minSeuro);

		require(validTicks(), 'err-inv-tick');

		INonfungiblePositionManager.MintParams memory params =
			INonfungiblePositionManager.MintParams({
			token0: token0,
			token1: token1,
			fee: fee,
			tickLower: TICK_LOWER,
			tickUpper: TICK_UPPER,
			amount0Desired: amount0Desired,
			amount1Desired: amount1Desired,
			amount0Min: amount0Min,
			amount1Min: amount1Min,
			recipient: address(this),
			deadline: block.timestamp
		});

		(uint256 tokenID, /* liquidity */ , uint256 amount0, uint256 amount1) = manager.mint(params);
		positionIDs.push(tokenID);

		TransferHelper.safeApprove(standardEuroContract, address(manager), 0);
		TransferHelper.safeApprove(erc20compatible, address(manager), 0);

		uint256 refundUsdt = token0 == erc20compatible ?
			_amountOther - amount0 :
			_amountOther - amount1;

		TransferHelper.safeTransfer(erc20compatible, msg.sender, refundUsdt);
	}
}
