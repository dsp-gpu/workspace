#include "mylib.h"
#include <iostream>
int main() {
    std::cout << "=== Build Info ===\n" << mylib::get_build_info() << std::endl;
    return 0;
}
// dirty
