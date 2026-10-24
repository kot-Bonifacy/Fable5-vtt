import { beforeEach, expect, it } from 'vitest';
import type { GmAttentionItem } from './gm-attention.js';
import { useGmAttentionStore } from './stores/gmAttentionStore.js';

const request: GmAttentionItem = {
  key: 'msg:1',
  kind: 'request',
  text: 'Marek prosi o Test: Przesłuchiwanie (FAC)',
  tab: 'chat',
  messageId: 1,
};
const permit: GmAttentionItem = {
  key: 'permit:u1',
  kind: 'permit',
  text: 'Marek prosi o zgodę na nową postać',
  tab: 'characters',
};

beforeEach(() => useGmAttentionStore.getState().clear());

it('queues a Test request for the decision panel instead of a toast (24.10)', () => {
  useGmAttentionStore.getState().announce([request, permit]);
  const state = useGmAttentionStore.getState();
  expect(state.decisions).toEqual(['msg:1']);
  expect(state.toasts.map((toast) => toast.key)).toEqual(['permit:u1']);
});

it('sets a matter aside without queueing it twice', () => {
  const store = useGmAttentionStore.getState();
  store.announce([request]);
  store.announce([request, { ...request, key: 'msg:2', messageId: 2 }]);
  expect(useGmAttentionStore.getState().decisions).toEqual(['msg:1', 'msg:2']);
  useGmAttentionStore.getState().setAside('msg:1');
  expect(useGmAttentionStore.getState().decisions).toEqual(['msg:2']);
});

it('drops a matter from the panel once the GM follows it to the chat', () => {
  useGmAttentionStore.getState().announce([request]);
  useGmAttentionStore.getState().goTo(request);
  expect(useGmAttentionStore.getState().decisions).toEqual([]);
});
