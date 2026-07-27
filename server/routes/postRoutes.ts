import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { generatePost, getGenerations, getPosts, schedulePosts } from "../controllers/postController.js";
import { upload } from "../config/multer.js";


const postRouter = express.Router();


postRouter.get('/',protect,getPosts);
postRouter.get('/generations',protect,getGenerations);
postRouter.post('/',protect,upload.single("media"), schedulePosts);
postRouter.post('/generate',protect, generatePost);


export default postRouter;