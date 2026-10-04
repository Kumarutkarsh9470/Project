#pragma once
// v9 workload: a read-mostly cache shared by every task.
// Many readers OR one writer.
// (Measure before assuming it beats std::mutex.)
#include <map>
#include <mutex>
#include <shared_mutex>
#include <string>

class DnsCache {
    std::map<std::string, std::string> entries;     // guarded by m
    mutable std::shared_mutex m;
public:
    std::string find(const std::string& host) const {
        std::shared_lock lock(m);       // readers share
        auto it = entries.find(host);
        return it == entries.end() ? "" : it->second;
    }
    void update(const std::string& host, const std::string& ip) {
        std::unique_lock lock(m);       // writer alone
        entries[host] = ip;
    }
};
