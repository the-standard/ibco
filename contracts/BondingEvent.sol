//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "contracts/uniswap/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract BondingEvent {
	INonfungiblePositionManager private immutable manager;
	address public immutable standardEuroContract;
	address public immutable tetherContract;
	address public pool;
	uint256 public immutable MIN_USDT = 0;
	int24 public tickSpacing;

	int24 private constant TICK_LOWER = -887270;
	int24 private constant TICK_UPPER = 887270;
	uint24 private fee; // should the fee really be private?
	uint256[] private positionIDs;

	constructor(address _sEuro, address _Usdt, address _manager) {
		standardEuroContract = _sEuro;
		tetherContract = _Usdt;
		manager = INonfungiblePositionManager(_manager);
	}

	/// TODO SIMON
	function getLowestFirst() private view returns (address token0, address token1) {
		(token0, token1) = standardEuroContract < tetherContract
			? (standardEuroContract, tetherContract)
			: (tetherContract, standardEuroContract);
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

	function bond(uint256 _amountSeuro, uint256 _amountUsdt) public {
		TransferHelper.safeTransferFrom(standardEuroContract, msg.sender, address(this), _amountSeuro);
		TransferHelper.safeTransferFrom(tetherContract, msg.sender, address(this), _amountUsdt);
		TransferHelper.safeApprove(standardEuroContract, address(manager), _amountSeuro);
		TransferHelper.safeApprove(tetherContract, address(manager), _amountUsdt);

		(address token0, address token1) = getLowestFirst();
		// not sure why the full amount of seuro can't be added
		uint256 minSeuro = _amountSeuro - 1 ether;
		(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) =
			token0 == standardEuroContract ?
			(_amountSeuro, _amountUsdt, minSeuro, MIN_USDT) :
			(_amountUsdt, _amountSeuro, MIN_USDT, minSeuro);

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
		TransferHelper.safeApprove(tetherContract, address(manager), 0);

		uint256 refundUsdt = token0 == tetherContract ?
			_amountUsdt - amount0 :
			_amountUsdt - amount1;

		TransferHelper.safeTransfer(tetherContract, msg.sender, refundUsdt);
	}
}
