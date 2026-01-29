// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from '../../../public/state.js';

describe('Storage Security Resilience', () => {

    beforeEach(() => {
        localStorage.clear();
        // Since we are using happy-dom, we might need to manually ensure storage is clean
        // but localStorage.clear() should work.
    });

    it('should return default value when localStorage contains invalid JSON (Fixed)', () => {
        // Arrange: Inject corrupted data
        localStorage.setItem('ensemble_testKey', '{invalid-json');

        // Act
        const result = storage.get('testKey');

        // Assert: verify it handles error gracefully
        expect(result).toEqual([]);
    });

    it('should return default value when localStorage is empty', () => {
        const result = storage.get('nonExistentKey');
        expect(result).toEqual([]);
    });

    it('should return parsed data when localStorage is valid', () => {
        localStorage.setItem('ensemble_validKey', JSON.stringify({ foo: 'bar' }));
        const result = storage.get('validKey');
        expect(result).toEqual({ foo: 'bar' });
    });
});
