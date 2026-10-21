# 先欠一秒

横屏 2D 网页街机：借走现在的一秒，带着奖励活到兑现。

## 本地运行

使用 Node.js 22.18+ 或 24.12+；本次验证环境为 Node.js 24.21.0。

~~~powershell
cd E:\One_second_first
npm ci
npm run dev
~~~

打开 http://127.0.0.1:5173 。第一次进入会进行三步互动教学。

同一局域网手机试玩时使用：

~~~powershell
npm run dev -- --host 0.0.0.0
~~~

在手机浏览器打开电脑局域网 IP 的 5173 端口，横屏游玩。浏览器不自动旋转时，点击「直接横屏试玩」，再把手机横着拿；页面会自行旋转画面和触控方向，不依赖全屏或系统方向锁定接口。仅在需要时开放本地防火墙；这不是公网部署。

## 怎么玩

- WASD／方向键移动；手机左侧摇杆移动。
- 空格／「借 1 秒」：机关暂停一秒，你继续移动。已有危险仍然会伤害你。
- E／「开始还债」：机关两倍速运行，直到本轮欠债全部还清。
- 每轮最多欠三秒，第一次借时后的八秒内必须还清。再次借时不会延期，来不及偿还时不能继续借。
- 普通拾取立即增加十分；冻结期间拾取的十分先暂存，还清后按二十分入账。死亡会失去未兑现收益。
- 第二波开始出现定时爆雷：金色圆圈标明爆炸范围，借时冻结后触碰菱形核心可拆弹，每枚暂存 30 分，清债后兑现 60 分。已经爆炸的区域不能拆除。
- 第三波出现换轨封锁：先进入蓝边空白带，等第一段封锁消失后立即换到下一条通道。还债会同时加快预警和封锁。
- Esc 暂停。失焦、切后台、竖屏及超过 250ms 的运行中断也会暂停；返回后手动继续。
- 结算页可用同一个种子重试，也可以开始新局面。

## 验证命令

~~~powershell
npm run test
npm run build
npm run test:browser
npm run test:release
npm run test:soak
~~~

浏览器测试默认使用 Windows 安装的 Chrome。覆盖其他安装位置：

~~~powershell
$env:BROWSER_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:browser
~~~

也可以将 BROWSER_PATH 设为其他本地 Chromium 的可执行文件。耐久测试实际运行十分钟，并在 docs/verification/soak.json 输出原始采样。普通浏览器测试不会等待十分钟。

## 工程

- TypeScript 严格模式，Phaser 4.2.0，Vite 8，Vitest，Playwright。
- src/game：60Hz 固定步模拟、整数时间、扫掠碰撞、种子随机数、十一组机关编排。
- src/scene.ts：仅绘制与视觉反馈，不计算债务或分数。
- src/input.ts：键盘和独立 pointerId 多点触控。
- src/main.ts：菜单、教学、结算、状态栏与运行生命周期。
- src/storage.ts：版本化本地存档，损坏或不可用时继续运行。
- src/audio.ts：原生 Web Audio 原创合成音效，无远程音频依赖。

游戏与 CRM/OA 项目独立，无账号、后台服务和数据库。本地成绩可被用户修改，不用于在线排行榜。

## 交付记录

- [规则和数值](docs/RULES.md)
- [测试与验收记录](docs/VERIFICATION.md)
- [1.0.1 代码与边界审计](docs/AUDIT.md)
- [部署和回滚](docs/DEPLOYMENT.md)
- [真人试玩表](docs/PLAYTEST.md)
- [第三方和素材说明](docs/THIRD_PARTY.md)

真机和真人体验验收需要实际设备和参与者。浏览器触屏仿真不等于 iPhone／Android 真机通过，十分钟本地耐久测试也不等于长期留存验证。

创意定位为「实时躲避＋主动加速还债＋暂存收益兑现」，不宣称时间借贷概念首创。
