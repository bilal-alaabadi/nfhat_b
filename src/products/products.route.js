// routes/products.js
const express = require("express");
const Products = require("./products.model");
const Reviews = require("../reviews/reviews.model");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");
const router = express.Router();

// رفع صور (Base64 -> URLs)
const { uploadImages } = require("../utils/uploadImage");
router.post("/uploadImages", async (req, res) => {
  try {
    const { images } = req.body;
    if (!images || !Array.isArray(images)) {
      return res.status(400).send({ message: "يجب إرسال مصفوفة من الصور" });
    }
    const uploadedUrls = await uploadImages(images);
    res.status(200).send(uploadedUrls);
  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).send({ message: "حدث خطأ أثناء تحميل الصور" });
  }
});

// إنشاء منتج
const categoriesRequiringSize = new Set([
  "فازلين زيت الزيتون",
  "بودرة مزيل رائحة العرق",
  "كريم مزيل رائحة العرق",
]);

router.post("/create-product", async (req, res) => {
  try {
    let { name, category, size, description, price, oldPrice, image, author } = req.body;

    if (!name || !category || !description || price == null || !image || !author) {
      return res.status(400).send({ message: "جميع الحقول المطلوبة يجب إرسالها" });
    }

    price = Number(price);
    if (Number.isNaN(price) || price < 0) {
      return res.status(400).send({ message: "قيمة السعر غير صالحة" });
    }

    if (oldPrice !== undefined && oldPrice !== "") {
      oldPrice = Number(oldPrice);
      if (Number.isNaN(oldPrice) || oldPrice < 0) {
        return res.status(400).send({ message: "قيمة السعر القديم غير صالحة" });
      }
    } else {
      oldPrice = undefined;
    }

    if (categoriesRequiringSize.has(category) && !size) {
      return res.status(400).send({ message: "يجب تحديد الحجم لهذا المنتج" });
    }

    const finalName = size ? `${name} - ${size}` : name;

    const productData = {
      name: finalName,
      category,
      size: size || undefined,
      description,
      price,
      oldPrice,
      image,
      author,
    };

    const newProduct = new Products(productData);
    const savedProduct = await newProduct.save();

    res.status(201).send(savedProduct);
  } catch (error) {
    console.error("Error creating new product", error);
    res.status(500).send({ message: "Failed to create new product" });
  }
});

// جلب كل المنتجات مع فلاتر
// routes/products.js  (مقطع جلب كل المنتجات)
router.get("/", async (req, res) => {
  try {
    const {
      category,
      size,
      color,
      minPrice,
      maxPrice,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};

    // فلترة الفئة (إن وُجدت)
    if (category && category !== "all") {
      filter.category = category;
    }

    // ✅ فلترة الحجم دائماً إذا تم إرساله (بدون قيد "حناء بودر")
    if (size) {
      filter.size = size;
    }

    if (color && color !== "all") {
      filter.color = color;
    }

    if (minPrice && maxPrice) {
      const min = parseFloat(minPrice);
      const max = parseFloat(maxPrice);
      if (!isNaN(min) && !isNaN(max)) {
        filter.price = { $gte: min, $lte: max };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalProducts = await Products.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / parseInt(limit));

    const products = await Products.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("author", "email")
      .sort({ createdAt: -1 });

    res.status(200).send({ products, totalPages, totalProducts });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send({ message: "Failed to fetch products" });
  }
});


// جلب منتج واحد
router.get(["/:id", "/product/:id"], async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Products.findById(productId).populate("author", "email username");
    if (!product) {
      return res.status(404).send({ message: "Product not found" });
    }
    const reviews = await Reviews.find({ productId }).populate("userId", "username email");
    res.status(200).send({ product, reviews });
  } catch (error) {
    console.error("Error fetching the product", error);
    res.status(500).send({ message: "Failed to fetch the product" });
  }
});

// تحديث منتج (JSON، بدون multer)
router.patch("/update-product/:id",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const productId = req.params.id;

      let {
        name,
        category,
        price,
        oldPrice,
        description,
        size,
        image,
        author
      } = req.body;

      if (!name || !category || price == null || !description) {
        return res.status(400).send({ message: "جميع الحقول المطلوبة يجب إرسالها" });
      }

      price = Number(price);
      if (Number.isNaN(price) || price < 0) {
        return res.status(400).send({ message: "قيمة السعر غير صالحة" });
      }

      if (oldPrice !== undefined && oldPrice !== "") {
        oldPrice = Number(oldPrice);
        if (Number.isNaN(oldPrice) || oldPrice < 0) {
          return res.status(400).send({ message: "قيمة السعر القديم غير صالحة" });
        }
      } else {
        oldPrice = undefined;
      }

      if (category === 'حناء بودر' && !size) {
        return res.status(400).send({ message: "يجب تحديد حجم الحناء" });
      }

      const finalName = size ? `${name} - ${size}` : name;

      const updateData = {
        name: finalName,
        category,
        price,
        oldPrice,
        description,
        size: size || undefined,
        author
      };

      if (image !== undefined) {
        if (Array.isArray(image)) {
          updateData.image = image;
        } else if (typeof image === 'string' && image.trim() !== '') {
          updateData.image = [image];
        }
      }

      const updatedProduct = await Products.findByIdAndUpdate(
        productId,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!updatedProduct) {
        return res.status(404).send({ message: "المنتج غير موجود" });
      }

      res.status(200).send({
        message: "تم تحديث المنتج بنجاح",
        product: updatedProduct,
      });
    } catch (error) {
      console.error("خطأ في تحديث المنتج", error);
      res.status(500).send({
        message: "فشل تحديث المنتج",
        error: error.message
      });
    }
  }
);

// حذف منتج
router.delete("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const deletedProduct = await Products.findByIdAndDelete(productId);

    if (!deletedProduct) {
      return res.status(404).send({ message: "Product not found" });
    }

    await Reviews.deleteMany({ productId: productId });

    res.status(200).send({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting the product", error);
    res.status(500).send({ message: "Failed to delete the product" });
  }
});

// منتجات ذات صلة
router.get("/related/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).send({ message: "Product ID is required" });
    }
    const product = await Products.findById(id);
    if (!product) {
      return res.status(404).send({ message: "Product not found" });
    }

    const titleRegex = new RegExp(
      product.name
        .split(" ")
        .filter((word) => word.length > 1)
        .join("|"),
      "i"
    );

    const relatedProducts = await Products.find({
      _id: { $ne: id },
      $or: [
        { name: { $regex: titleRegex } },
        { category: product.category },
      ],
    });

    res.status(200).send(relatedProducts);

  } catch (error) {
    console.error("Error fetching the related products", error);
    res.status(500).send({ message: "Failed to fetch related products" });
  }
});

module.exports = router;
