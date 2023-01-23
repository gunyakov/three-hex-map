import { Texture } from "three";

class TextureAtlas {
    private textures = {};
    constructor(json:any, texture:Texture) {

      const { frames } = json;
  
      Object.keys(frames).forEach((name) => {
        const t = texture.clone();
        const data = frames[name].frame;
        t.repeat.set(data.w / texture.image.width, data.h / texture.image.height);
        t.offset.x = data.x / texture.image.width;
        t.offset.y =
          1 - data.h / texture.image.height - data.y / texture.image.height;
        t.needsUpdate = true;
  
        this.textures[name] = t;
      });
    }
  
    getTexture(name) {
      return this.textures[name];
    }
  }
  
  export default TextureAtlas;