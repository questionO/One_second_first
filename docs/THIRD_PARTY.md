# 第三方与素材说明

- Phaser 4.2.0：MIT，https://github.com/phaserjs/phaser 。发布时保留本目录中的 Phaser 许可证。
- Phaser 运行时依赖 eventemitter3：MIT，发布时保留相应许可证。
- TypeScript、Vite、Vitest、Playwright 为构建与测试工具，精确版本见 package-lock.json。
- 本项目的数字字形、图标、角色、场地、机关及效果为代码绘制；没有下载外部图片或字体。
- 音效由 Web Audio 振荡器和包络合成，不包含第三方音乐。
- 中文字体使用设备系统字体，不分发字体文件。
- 时间借贷概念已有其他游戏使用，本项目不宣称概念首创，也未使用这些游戏的代码或美术。

生产构建的 postbuild 步骤会将运行时依赖许可证复制到 dist，部署时保留这些文件。
