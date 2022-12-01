import * as config from './config.js';
import { Langs } from './contracts.js';

describe('configuration', () => {
  test('should return config', () => {
    config.set({
      wildcardIterations: 2000,
      wildcardSeperator: '_',
      lang: Langs.en_US,
      custom: 'value',
    });

    expect(config.get()).toMatchObject({
      wildcardIterations: 2000,
      wildcardSeperator: '_',
      lang: Langs.en_US,
      custom: 'value',
    });
  });
});
