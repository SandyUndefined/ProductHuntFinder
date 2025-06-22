{ pkgs }: {
  deps = [
    pkgs.nodejs-18_x
    pkgs.nodePackages.npm
    pkgs.nodePackages.typescript
  ];
  
  env = {
    NODE_ENV = "production";
    PATH = "${pkgs.nodejs-18_x}/bin:${pkgs.nodePackages.npm}/bin:$PATH";
  };
}
