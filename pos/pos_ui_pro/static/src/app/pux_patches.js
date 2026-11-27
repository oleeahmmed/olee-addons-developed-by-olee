import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PuxBar } from "./pux_bar";
import { PuxCart } from "./pux_cart";

ProductScreen.components = { ...ProductScreen.components, PuxBar, PuxCart };
