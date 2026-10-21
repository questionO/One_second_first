import { afterEach, expect, it, vi } from 'vitest';
import { GameAudio } from '../src/audio';
import { defaults } from '../src/storage';

afterEach(() => vi.unstubAllGlobals());
function mockAudio(state = 'running') {
  const frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  const oscillator = { frequency, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  const gain = { gain: frequency, connect: vi.fn(), disconnect: vi.fn() };
  const context = { state, currentTime: 0, destination: {}, resume: vi.fn(async () => {}), close: vi.fn(async () => {}), createOscillator: vi.fn(() => oscillator), createGain: vi.fn(() => gain) };
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  const settings = defaults().settings, audio = new GameAudio(() => settings);
  return { audio, settings, context, oscillator, gain };
}
it('恢复被系统中断的音频上下文', async () => {
  const { audio, context } = mockAudio('interrupted'); await audio.unlock();
  expect(context.resume).toHaveBeenCalledOnce();
});
it('音频节点创建失败不会中断游戏事件处理', async () => {
  const { audio, context, oscillator } = mockAudio(); await audio.unlock();
  context.createGain.mockImplementation(() => { throw Error('audio unavailable'); });
  expect(() => audio.play({ type: 'coin' })).not.toThrow();
  expect(oscillator.disconnect).toHaveBeenCalledOnce();
});
it('暂停立即停止并断开活动音频节点', async () => {
  const { audio, oscillator, gain } = mockAudio(); await audio.unlock(); audio.play({ type: 'coin' }); audio.stop();
  expect(oscillator.disconnect).toHaveBeenCalledOnce(); expect(gain.disconnect).toHaveBeenCalledOnce();
});
it('静音不创建音频节点', async () => {
  const { audio, settings, context } = mockAudio(); await audio.unlock(); settings.muted = true; audio.play({ type: 'death' });
  expect(context.createOscillator).not.toHaveBeenCalled();
});
it('销毁后关闭上下文且不会再次创建或播放声音', async () => {
  const { audio, context, oscillator } = mockAudio(); await audio.unlock(); audio.play({ type: 'coin' });
  audio.destroy(); audio.destroy(); await audio.unlock(); audio.play({ type: 'coin' });
  expect(context.close).toHaveBeenCalledOnce(); expect(context.createOscillator).toHaveBeenCalledOnce();
  expect(oscillator.disconnect).toHaveBeenCalledOnce();
});
