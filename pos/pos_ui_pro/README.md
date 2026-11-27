# POS UI Pro (Odoo 19): প্রতিটা ব্যবসার আলাদা POS

## ব্যবসা বেছে নিন
POS → Configuration → Settings → **Business type** → বেছে Save। POS খুললে সেই ব্যবসার স্ক্রিন আসে।
(সেশন খোলা থাকলে বদলানো যায় না; আগে সেশন ক্লোজ করুন। Odoo নিজেই খোলা সেশনে Restaurant বদলাতে দেয় না।)

| Business type | লেআউট | রং |
|---|---|---|
| Restaurant / Bar | বাঁয়ে মেনু রেল, ডিশ টাইল, টেবিল/ফ্লোর, Send (KOT) | কমলা |
| Cafe / Coffee Shop | মেনু রেল, টাইল | বাদামি |
| Fast Food / Food Truck | চিপ, বড় টাইল | লাল |
| Bakery / Pastry | চিপ, টাইল | গোলাপি |
| Retail / General Store | চিপ, কার্ড | ইন্ডিগো |
| Supermarket / Grocery | চিপ, ঘন গ্রিড (এক স্ক্রিনে বেশি পণ্য) | সবুজ |
| Clothing / Boutique / Electronics | চিপ, লম্বা ছবির কার্ড | নীল |
| Pharmacy / Cosmetics | চিপ, লিস্ট সারি (নাম বাঁয়ে, দাম ডানে) | টিল |

## এক স্ক্রিনে সব (সব Odoo-র নিজের অ্যাকশন)
উপরের বার: **New** (এই বিল হোল্ড রেখে নতুন), **Tables** (রেস্টুরেন্ট), **Draft** (সেভ করে নতুন বিল),
**Orders** (হোল্ড/ড্রাফট/পেইড সব বিল), **Refund**, **Cash in/out**, **Close session**।
কার্টে প্রতিটা লাইনে − / + / ডিলিট। ডানে বড় টোটাল ও Payment।
Restaurant type বাছলে Odoo-র table service (ফ্লোর, KOT/Send, বিল স্প্লিট) নিজে চালু হয়।
ওজনের পণ্য, ভ্যারিয়েন্ট, লট/মেয়াদ, প্রিসেট (ডাইন-ইন/টেকঅ্যাওয়ে), কম্বো: সব Odoo-র নিজের ফিচার, সাথে সাথে কাজ করে।

## ইনস্টল / আপগ্রেড
```bash
python odoo-bin -c odoo.conf -d <db> -u pos_ui_pro
```
তারপর POS-এ Ctrl+Shift+R। নতুন মডেল নেই; `pos.config`-এ শুধু একটা selection ফিল্ড।
