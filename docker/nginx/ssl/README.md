# SSL 证书目录

将生产环境的证书和私钥放置于此目录：

- 证书路径：`docker/nginx/ssl/cert.pem`
- 私钥路径：`docker/nginx/ssl/key.pem`

临时测试可使用自签名证书（仅限开发/测试环境）。可参考同目录下 `generate-self-signed.sh` 快速生成。

注意：切勿将生产证书提交到版本库。

