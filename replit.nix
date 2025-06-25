{ pkgs }: {
  deps = [
    pkgs.nodejs-20_x
    pkgs.nodePackages.npm
    pkgs.nodePackages.typescript
    pkgs.nodePackages.vite
  ];
  
  env = {
    NODE_ENV = "production";
    PORT = "5000";
    PATH = "${pkgs.nodejs-20_x}/bin:${pkgs.nodePackages.npm}/bin:$PATH";
    VITE_API_URL = "http://localhost:5000";
  };
}
