#include "mylib.h"
#include "version.h"
#include <sstream>

namespace mylib {

std::string get_version() { return VERSION_STRING; }
std::string get_version_full() { return VERSION_FULL; }

std::string get_build_info() {
    std::ostringstream ss;
    ss << "Version:  " << VERSION_FULL << "\n"
       << "Git hash: " << GIT_HASH_SHORT << "\n"
       << "Branch:   " << GIT_BRANCH << "\n"
       << "Tag:      " << GIT_TAG << "\n"
       << "Describe: " << GIT_DESCRIBE << "\n"
       << "Dirty:    " << (GIT_IS_DIRTY ? "yes" : "no") << "\n"
       << "Date:     " << GIT_DATE << "\n"
       << "Built:    " << BUILD_TIMESTAMP;
    return ss.str();
}
} // namespace mylib
// change
