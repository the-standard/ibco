// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";

contract StakingDirectory is Ownable {

    address[] public entries;

    constructor() {}

    function add(address _address) external onlyOwner {
        entries.push(_address);
    }

    function deleteEntry(uint256 index) private {
        for (uint256 i = index; i < entries.length - 1; i++) entries[i] = entries[i+1];
        entries.pop();
    }

    function del(address _address) external onlyOwner {
        for (uint256 i = 0; i < entries.length; i++) if (entries[i] == _address) deleteEntry(i);
    }

    function list() public view returns (address[] memory) {
        return entries;
    }
}