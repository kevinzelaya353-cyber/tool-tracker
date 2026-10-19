// Imágenes importadas como módulo (Metro las resuelve a una fuente de <Image>).
declare module "*.png" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}
