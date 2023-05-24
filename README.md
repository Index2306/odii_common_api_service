# odii-api

### How to run

-   Create a `.env` file following the `.env.example` or export these variables to the environment

-   Run `npm start` to start the application, it will be running on port 3000 by default

### TODO

-   Get Key Webpush: ./node_modules/.bin/web-push generate-vapid-keys

## DISCOUNT

-   Table : Discount - Product - ProductDiscount
-   Discount :
    -   Supplier create new discount type : Cash or Percent
    -   Add queue worker to update in Product DB (product-discount-metadata)
    -   Update to elasticsearch
