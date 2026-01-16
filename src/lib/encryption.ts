import { webcrypto } from 'crypto';

// Client-side encryption utilities using Web Crypto API
export class ClientEncryption {
  private static encoder = new TextEncoder();
  private static decoder = new TextDecoder();

  /**
   * Generate a random encryption key
   */
  static async generateKey(): Promise<CryptoKey> {
    return await webcrypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Export a CryptoKey to a portable format
   */
  static async exportKey(key: CryptoKey): Promise<string> {
    const exported = await webcrypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(exported);
  }

  /**
   * Import a CryptoKey from a portable format
   */
  static async importKey(keyData: string): Promise<CryptoKey> {
    const keyBuffer = this.base64ToArrayBuffer(keyData);
    return await webcrypto.subtle.importKey(
      'raw',
      keyBuffer,
      'AES-GCM',
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt data using AES-GCM
   */
  static async encrypt(data: string, key: CryptoKey): Promise<string> {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const encrypted = await webcrypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      this.encoder.encode(data)
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * Decrypt data using AES-GCM
   */
  static async decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
    const combined = this.base64ToArrayBuffer(encryptedData);
    const combinedArray = new Uint8Array(combined);

    const iv = combinedArray.slice(0, 12);
    const encrypted = combinedArray.slice(12);

    const decrypted = await webcrypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      encrypted
    );

    return this.decoder.decode(decrypted);
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Master key management for passwordless authentication
export class MasterKeyManager {
  private static SERVICE_KEY = 'emailalies-service-key-2024'; // In production, use environment variable

  /**
   * Generate a random master key for a user
   */
  static async generateMasterKey(): Promise<{ masterKey: CryptoKey; salt: string }> {
    const masterKey = await ClientEncryption.generateKey();
    const salt = webcrypto.getRandomValues(new Uint8Array(16));

    return {
      masterKey,
      salt: Array.from(salt).join(','),
    };
  }

  /**
   * Encrypt a master key for storage using service key
   */
  static async encryptMasterKey(masterKey: CryptoKey, salt: string): Promise<string> {
    const exportedKey = await ClientEncryption.exportKey(masterKey);

    // Use service key to encrypt the master key
    const { key: serviceKey } = await this.deriveServiceKey(salt);
    return await ClientEncryption.encrypt(exportedKey, serviceKey);
  }

  /**
   * Decrypt a master key from storage
   */
  static async decryptMasterKey(encryptedMasterKey: string, salt: string): Promise<CryptoKey> {
    const { key: serviceKey } = await this.deriveServiceKey(salt);
    const decryptedKeyData = await ClientEncryption.decrypt(encryptedMasterKey, serviceKey);
    return await ClientEncryption.importKey(decryptedKeyData);
  }

  /**
   * Derive service key for encrypting master keys
   */
  private static async deriveServiceKey(salt: string): Promise<{ key: CryptoKey; salt: string }> {
    const encoder = new TextEncoder();
    const saltBuffer = new Uint8Array(salt.split(',').map(Number));

    const keyMaterial = await webcrypto.subtle.importKey(
      'raw',
      encoder.encode(this.SERVICE_KEY),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await webcrypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    return {
      key,
      salt: Array.from(saltBuffer).join(','),
    };
  }
}

// Email content encryption utilities
export class EmailEncryption {
  /**
   * Encrypt email content for storage
   */
  static async encryptEmail(content: string, key: CryptoKey): Promise<string> {
    return await ClientEncryption.encrypt(content, key);
  }

  /**
   * Decrypt email content
   */
  static async decryptEmail(encryptedContent: string, key: CryptoKey): Promise<string> {
    return await ClientEncryption.decrypt(encryptedContent, key);
  }

  /**
   * Generate a unique alias for email forwarding
   */
  static generateAlias(length: number = 12): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}