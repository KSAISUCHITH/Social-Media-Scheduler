import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getActivity } from "../controllers/ActivityController.js";



const activityRouter = express.Router();

activityRouter.get('/',protect, getActivity);


export default  activityRouter;