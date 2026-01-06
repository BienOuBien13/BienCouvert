export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }

    const getRandomValues = typeof crypto !== 'undefined' && (crypto as any).getRandomValues
      ? (arr: Uint8Array) => (crypto as any).getRandomValues(arr)
      : (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
      };

    const bytes = new Uint8Array(16);
    getRandomValues(bytes);
    // Per RFC4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20,12)}`;
  } catch (e) {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}
