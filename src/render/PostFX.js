/**
 * Rendu direct de la scène.
 * Le bloom et le flou radial plein écran ont été retirés : sur beaucoup de cartes, le bloom
 * débordait en valeurs infinies dès que les flammes de boost s'allumaient (écran noir),
 * et le flou ajoutait plusieurs lectures de texture dès que la voiture prenait de la vitesse.
 * Le tone mapping ACES du renderer suffit.
 */
export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
  }

  setQuality() {}
  setSize() {}
  update() {}
  render() { this.renderer.render(this.scene, this.camera); }
  dispose() {}
}
