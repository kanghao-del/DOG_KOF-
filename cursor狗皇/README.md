# 狗皇 · DOG KOF

> 一个看似正常的格斗游戏，实际上充满恶意机关、心理陷阱和节目效果的鬼畜格斗游戏。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![No Build Step](https://img.shields.io/badge/build-none-brightgreen)](.)
[![Vanilla JS](https://img.shields.io/badge/vanilla-JS-f7df1e?logo=javascript)](.)

---

## Screenshots

![screenshot](docs/images/screenshot1.png)

---

## What Is This?

《狗皇》是一款运行在浏览器中的单文件 2D 格斗游戏。

表面上，它有着经典格斗游戏的所有要素：搓招、斩波、升龙、超必杀、米表、倒计时……

但每隔几秒，游戏就会对你做一些难以置信的事情。

**设计原则：将玩家的格斗游戏肌肉记忆彻底反噬。**

---

## Features

### 核心玩法

双人对战（人机），最佳三局两胜，每局 60 秒计时。你操控**打工人**，对手是戴着皇冠、穿着红斗篷的**柴犬狗皇**。

### 战斗系统

完整的格斗游戏框架，含帧数数据（startup / active / recovery）：

| 指令 | 技能 | 说明 |
|------|------|------|
| `J` | 轻拳 | 快速短促 |
| `K` | 重拳 | 伤害更高 |
| `U` | 轻腿 | 中距离 |
| `I` | 重腿 | 有追击浮空 |
| `H` | 投技 | 破防，无法被格挡 |
| `↓→ + J` | 气功弹 | 地面射弹 |
| `→↓→ + K` | 升龙拳 | 无敌帧逆转 |
| `满米表 + K` | 超必杀 | 全屏大范围 |

### 特殊角色

- **打工人**：蓝道服空手道战士，HP 200，由玩家操控
- **狗皇**：橙色柴犬 Boss，HP 220，由自适应 AI 驱动。AI 会统计玩家的搓招频率，识别跳跃习惯，进行反跳升龙，并在中立间隙进行嘲讽

### 场景机制

场景为动态夜城剪影，现场观众排随机弹动。场地存在两类危险物：

- **外卖电动车**（`Scooter`）：横穿场地，双方均受 14 伤害并被弹飞
- **天降随机物品**（`FallingObject`）：秋裤、板砖、广场舞音响、外卖、键盘，每次掉落 8 伤害

### 鬼畜机制 — Troll System

每隔 7～12 秒，游戏随机触发一个恶意事件：

| 事件 | 效果 |
|------|------|
| **操作反转** | 左右键互换约 4 秒 |
| **血条对调** | 双方血条显示互换 |
| **月球重力** | 重力降至 0.35，持续 5 秒 |
| **镜像世界** | Canvas 横向翻转约 3 秒 |
| **外卖来袭** | 召唤外卖电动车穿场 |
| **天降神秘** | 三连落体道具 |
| **狗皇嘲讽** | AI 发动言语攻势 |

### 升龙诅咒 — Dragon Curse

玩家每使出第 4 次升龙拳，将不会打出升龙——而是被以 `-34` 纵向速度**弹飞出地图**。专门针对升龙拳滥用者。

### 狗皇诈尸 — Fake Death

当狗皇血量归零，有 **70% 概率**在玩家以为获胜的瞬间复活，回复至最大血量的 18%，重新加入战场。每场仅限一次。

### 弹幕系统

重要事件发生时，仿直播弹幕从右向左滚动穿过画面，营造鬼畜节目现场感。

### 彩蛋设计

- 结算界面记录：诅咒触发次数、跳跃总次数、命中次数、被格挡次数
- 第 2 局开始有 60% 概率在真实回合横幅出现前先弹出「假 的」
- 假回合旗帜设计让握有对手的玩家有短暂懵逼时刻

---

## Tech Stack

| 技术 | 说明 |
|------|------|
| **Vanilla JavaScript (ES6)** | 全部逻辑，无任何框架或依赖 |
| **HTML5 Canvas 2D** | 960×540 分辨率渲染，全程程序绘图 |
| **Web Audio API** | 程序化音效合成（振荡器 + 噪声），零音频文件 |
| **CSS3** | UI 布局与全屏样式 |
| **Node.js `vm`** | 无头测试运行器（`test/headless.js`） |

无构建工具，无打包器，无 npm，无外部依赖。整个游戏是一个 ~1260 行的单文件引擎。

---

## Getting Started

无需安装任何依赖。

```bash
git clone https://github.com/your-username/cursor-dog-kof.git
cd cursor-dog-kof
```

直接用浏览器打开 `index.html` 即可游玩：

```bash
# Windows
start index.html

# macOS
open index.html

# Linux
xdg-open index.html
```

或使用任意静态文件服务器（例如 VS Code Live Server 插件）。

### 运行测试

```bash
node test/headless.js
```

---

## Project Structure

```
cursor狗皇/
├── index.html          # 游戏页面外壳，包含控制说明与 Canvas 容器
├── style.css           # 全部 UI 样式（全屏布局、字体、覆盖层）
├── game.js             # 完整游戏引擎（~1260 行）
│   ├── 常量与配置       # 画面尺寸、物理参数、帧率
│   ├── MOVES 表        # 所有招式的帧数、伤害、判定框数据
│   ├── Fighter 类      # 通用战斗单元（物理、状态机、绘制）
│   ├── Human 类        # 玩家角色（外观：蓝道服空手道战士）
│   ├── Dog 类          # AI 角色（外观：柴犬皇帝）
│   ├── DogAI 类        # 自适应 AI（招式统计、反跳、嘲讽）
│   ├── Scooter 类      # 外卖电动车场地危险物
│   ├── FallingObject   # 天降物品场地危险物
│   ├── TrollManager    # 鬼畜事件调度器
│   ├── AudioEngine     # Web Audio API 程序化音效
│   ├── DanmakuSystem   # 滚动弹幕渲染
│   └── GameLoop        # 主循环、回合管理、结算界面
└── test/
    └── headless.js     # Node.js 无头烟雾测试套件
```

---

## Development Journey

项目始于一个简单的问题：**如果一款格斗游戏的所有规则都是为了欺骗玩家而存在，会是什么感觉？**

**概念阶段**：收集格斗游戏中最常见的"肌肉记忆"——升龙拳无脑逆转、跳重攻击压制、投技破防……然后为每一种习惯设计对应的惩罚机制。

**原型阶段**：用 HTML5 Canvas 搭建最小可行的格斗框架，验证帧数系统、投影箱（hitbox）和基础物理是否可靠。

**核心机制迭代**：升龙诅咒、狗皇诈尸、鬼畜事件系统逐步加入，每次加入都经过反复测试以确认"节目效果"达到预期。

**单文件哲学**：所有代码保持在一个 `game.js` 中，追求"打开浏览器即玩，无需任何配置"的零摩擦体验。这也让代码审查和分享极为简单。

**AI 设计**：狗皇 AI 不是随机的，它会真实地记录你的招式使用频率，在你最依赖的招式上做文章。这让多次游玩的体验截然不同。

---

## Future Plans

- [ ] **新角色**：加入更多具有专属鬼畜机制的可选角色
- [ ] **新场景**：更多充满危险物的战斗场地（地铁站、写字楼、菜市场……）
- [ ] **联机模式**：WebSocket 双人对战，鬼畜事件同步广播
- [ ] **排行榜**：统计全球玩家被诅咒次数、被诈尸次数等耻辱数据
- [ ] **更多鬼畜机制**：键位随机重映射、画面随机色彩反转、假血条读数等
- [ ] **移动端支持**：触屏虚拟按键适配
- [ ] **回放系统**：保存最精彩（或最惨烈）的对局片段

---

## Controls

| 按键 | 动作 |
|------|------|
| `←` / `→` | 移动 |
| `↑` | 跳跃 |
| `↓` | 蹲下 / 格挡（按住） |
| `J` | 轻拳 |
| `K` | 重拳 |
| `U` | 轻腿 |
| `I` | 重腿 |
| `H` | 投技 |
| `↓ → + J` | 气功弹 |
| `→ ↓ → + K` | 升龙拳（第 4 次会反噬） |
| 满米表 + `K` | 超必杀 |

---

## License

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
