#include "form_ya221_delay_tm1_byte.hpp"
#include <cassert>
#include <cstdio>
int main() {
    using namespace Sau::Drv;
    YA221CtrlSettings s;
    s.m_imitMode = YA221Param3State::IMITYA221Pp;
    assert(FormYA221DelayTm1Byte(s) == 0x01);
    s.m_imitMode = YA221Param3State::IMITYA221Pi;
    assert(FormYA221DelayTm1Byte(s) == 0x02);
    s.m_imitMode = static_cast<YA221Param3State>(100);
    assert(FormYA221DelayTm1Byte(s) == 0x04);
    s.m_imitMode = static_cast<YA221Param3State>(220);
    assert(FormYA221DelayTm1Byte(s) == 0x05);
    s.m_imitMode = static_cast<YA221Param3State>(1501);
    assert(FormYA221DelayTm1Byte(s) == 0x07);
    s.m_imitMode = static_cast<YA221Param3State>(9999);
    assert(FormYA221DelayTm1Byte(s) == 0x00);
    std::printf("smoke OK\n");
    return 0;
}
