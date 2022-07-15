// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "contracts/uniswap/INonfungiblePositionManager.sol";

interface IRatioCalculator {
	function getRatioForSEuro(uint256 _amountSEuro, uint160 _price, int24 _lower, int24 _upper, bool _seuroIsToken0) external pure returns (uint256);
}

contract LiqTest {
    address public constant MANAGER =
        0xC36442b4a4522E871399CD717aBDD847Ab11FE88;

    address public immutable seuro;
    address public immutable other;
    INonfungiblePositionManager private immutable manager;
    IRatioCalculator private immutable RatioCalculator;

    int24 public tickSpacing;
    IUniswapV3Pool private pool;
    uint24 private fee;
    uint256 public lastTokenId;

    constructor(address _seuro, address _other, address _ratioCalculator) {
        seuro = _seuro;
        other = _other;
        manager = INonfungiblePositionManager(MANAGER);
        RatioCalculator = IRatioCalculator(_ratioCalculator);
    }

    function getAscendingPair()
        public
        view
        returns (address _token0, address _token1)
    {
        (_token0, _token1) = seuro < other ? (seuro, other) : (other, seuro);
    }

    function initialisePool(uint160 _price, uint24 _fee) external {
        (address token0, address token1) = getAscendingPair();
        fee = _fee;
        address _pool = manager.createAndInitializePoolIfNecessary(
            token0,
            token1,
            _fee,
            _price
        );
        pool = IUniswapV3Pool(_pool);
        tickSpacing = pool.tickSpacing();
    }

    function getPoolState()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        return pool.slot0();
    }

    function addLiquidity(
        uint256 _amountSEuro,
        uint256 _amountOther,
        int24 _lowerTick,
        int24 _upperTick
    ) external {
        // TODO consult the ratio again before transferring (take extra)
        TransferHelper.safeTransferFrom(
            seuro,
            msg.sender,
            address(this),
            _amountSEuro
        );
        TransferHelper.safeTransferFrom(
            other,
            msg.sender,
            address(this),
            _amountOther
        );
        TransferHelper.safeApprove(seuro, address(manager), _amountSEuro);
        TransferHelper.safeApprove(other, address(manager), _amountOther);

        (address token0, address token1) = getAscendingPair();

        (uint256 _amount0, uint256 _amount1, uint256 _amount0min, uint256 _amount1min) = token0 == seuro ?
            (_amountSEuro, _amountOther, _amountSEuro, uint256(0)) :
            (_amountOther, _amountSEuro, uint256(0), _amountSEuro);

        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: _lowerTick,
                tickUpper: _upperTick,
                amount0Desired: _amount0,
                amount1Desired: _amount1,
                amount0Min: _amount0min,
                amount1Min: _amount1min,
                recipient: address(this),
                deadline: block.timestamp
            });


        // TODO require success of mint – otherwise revert the whole thing
        // TODO what do we have to do with the collateral? is revert and refund fine?

        (
            uint256 tokenId,
            uint128 _liquidity,
            uint256 amount0,
            uint256 amount1
        ) = manager.mint(params);
        lastTokenId = tokenId;
    }

    function tickInfo(int24 _tick)
        external view
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128,
            int56 tickCumulativeOutside,
            uint160 secondsPerLiquidityOutsideX128,
            uint32 secondsOutside,
            bool initialized
        ) {
        return pool.ticks(_tick);
    }

    function getOtherAmount(uint256 _amountSEuro, int24 _lowerTick, int24 _upperTick) external view returns (uint256) {
        (uint160 price,,,,,,) = pool.slot0();
        (address token0,) = getAscendingPair();
        bool seuroIsToken0 = token0 == seuro;
        return RatioCalculator.getRatioForSEuro(_amountSEuro, price, _lowerTick, _upperTick, seuroIsToken0);
    }
}
