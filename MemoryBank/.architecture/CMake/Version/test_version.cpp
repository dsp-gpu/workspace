#include "version.h"
#include "mylib.h"
#include <string>
#include <cstdlib>
#include <iostream>
int main() {
    std::string v = mylib::get_version();
    if (v.empty()) { std::cerr << "FAIL: empty version\n"; return EXIT_FAILURE; }
    std::string h = GIT_HASH_SHORT;
    if (h.empty()) { std::cerr << "FAIL: empty hash\n"; return EXIT_FAILURE; }
    std::cout << "PASS: " << mylib::get_version_full() << std::endl;
    return EXIT_SUCCESS;
}
