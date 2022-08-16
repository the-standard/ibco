// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";

contract StakingDirectory is Ownable {

    mapping(uint => address) private entries;
    uint private entryCount;   

    constructor() {}

    function add(address _address) external onlyOwner {
        entries[entryCount] = _address;
        entryCount++;
    }

    function del(address _address) external onlyOwner {
        for (uint i = 0; i < entryCount; i++) {
            if (entries[i] != _address) {
                continue;
            }
            delete entries[i];
            entryCount--;
            return;
        }
    }

    function list() public view returns (address []memory) {
        address[] memory ret = new address[](entryCount);
        for (uint i = 0; i < entryCount; i++) {
            ret[i] = entries[i];
        }
        return ret;
    }
}
