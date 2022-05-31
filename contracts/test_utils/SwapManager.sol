//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract SwapManager {
    address private constant SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address private constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    ISwapRouter private immutable router;

    constructor() {
        router = ISwapRouter(SWAP_ROUTER);
    }

    function swapEthForToken(address _token) external payable {
        uint256 deadline = block.timestamp;
        address tokenIn = WETH9;
        address tokenOut = _token;
        uint24 fee = 3000;
        address recipient = msg.sender;
        uint256 amountIn = msg.value;
        uint256 amountOutMinimum = 1;
        uint160 sqrtPriceLimitX96 = 0;

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams(
                tokenIn,
                tokenOut,
                fee,
                recipient,
                deadline,
                amountIn,
                amountOutMinimum,
                sqrtPriceLimitX96
            );

        router.exactInputSingle{value: msg.value}(params);
    }
}
