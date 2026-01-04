/**
 * Sprite loading and caching system
 */

export class SpriteLoader {
  private sprites: Map<string, HTMLImageElement> = new Map();
  private loadingPromises: Map<string, Promise<HTMLImageElement>> = new Map();

  /**
   * Load a sprite image
   */
  async loadSprite(name: string, path: string): Promise<HTMLImageElement> {
    // Return cached sprite if already loaded
    if (this.sprites.has(name)) {
      return this.sprites.get(name)!;
    }

    // Return existing loading promise if in progress
    if (this.loadingPromises.has(name)) {
      return this.loadingPromises.get(name)!;
    }

    // Create new loading promise
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        this.sprites.set(name, img);
        this.loadingPromises.delete(name);
        resolve(img);
      };

      img.onerror = () => {
        this.loadingPromises.delete(name);
        reject(new Error(`Failed to load sprite: ${path}`));
      };

      img.src = path;
    });

    this.loadingPromises.set(name, promise);
    return promise;
  }

  /**
   * Get a loaded sprite (synchronous)
   */
  getSprite(name: string): HTMLImageElement | null {
    return this.sprites.get(name) || null;
  }

  /**
   * Check if a sprite is loaded
   */
  hasSprite(name: string): boolean {
    return this.sprites.has(name);
  }

  /**
   * Load multiple sprites
   */
  async loadSprites(sprites: { name: string; path: string }[]): Promise<void> {
    await Promise.all(sprites.map((s) => this.loadSprite(s.name, s.path)));
  }
}

// Global sprite loader instance
export const spriteLoader = new SpriteLoader();
