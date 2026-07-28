
import { Response } from "express";
import { AuthRequest } from "../middleware/authMiddleware.js";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { cloudinary } from "../config/cloudinary.js";
import { Generation } from "../models/Generation.js";
import { Post } from "../models/Post.js";




// Generate Post
// POST /api/posts/generate





export const generatePost = async (req:AuthRequest,res: Response):Promise<void> => {
      try{
                const {prompt,tone, generateImage} = req.body;

                const apiKey=process.env.GEMINI_API_KEY;

                if(!apiKey){
                    res.status(400).json({message: "Gemini API Key is missing."})
                    return;
                }
              



                const ai = new GoogleGenAI({apiKey});
                const model = process.env.GENAI_MODEL || "gemini-3.5-flash-lite";
                //Generate content
                const textResponse = await ai.models.generateContent({
                 model,
                  contents: `Generate a social media post based on this prompt: "${prompt}".
                  Tone: ${tone}. 
                  Include relevant hashtags.
                  Format the response as JSON with "content" and "imagePrompt" fields
                  The "imagePrompt" should be a highly descriptive prompt for an image generator that complements the post.`,


                   });

                   let content="";
                   let imagePrompt = prompt;
                  


                   try {
                        const rawText = textResponse.text || "";
                        const jsonMatch = rawText.match(/\{[\s\S]*\}/)

                        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {content: rawText,
                            imagePrompt: prompt
                        };
                        content=data.content;
                        imagePrompt = data.imagePrompt;
                   } catch (error) {
                      content = textResponse.text || ""
                   }

                   let mediaUrl = "";
                   let TempUrl = "";

                  if (generateImage) {
                    try {
                      const HF_TOKEN = process.env.HF_TOKEN;
                      const hfImageModel = process.env.HF_IMAGE_MODEL || "stabilityai/stable-diffusion-xl-base-1.0";

                      if (!HF_TOKEN) {
                        throw new Error("Hugging Face token is missing. Set HF_TOKEN in your environment.");
                      }

                      const hfImageEndpoint =process.env.HF_IMAGE_ENDPOINT ||`https://api-inference.huggingface.co/models/${hfImageModel}`;

                      const HFresponse = await axios.post(
                        hfImageEndpoint,
                        { inputs: imagePrompt },
                        {
                          headers: {
                            Authorization: `Bearer ${HF_TOKEN}`,
                          },
                          responseType: "arraybuffer",
                        }
                      );

                      const responseContentType = HFresponse.headers["content-type"] as string | undefined;
                      if (!responseContentType?.startsWith("image/")) {
                        const body = Buffer.from(HFresponse.data).toString("utf8");
                        throw new Error(`Hugging Face returned non-image data: ${body}`);
                      }

                      const base64Image = Buffer.from(HFresponse.data).toString("base64");
                      TempUrl = `data:${responseContentType};base64,${base64Image}`;

                      const uploadResult = await cloudinary.uploader.upload(TempUrl, {
                        folder: "ai-generations",
                      });

                      mediaUrl = uploadResult.secure_url;
                    } catch (error: any) {
                      console.error(
                        "Hugging Face Image Error:",
                        error.response?.data || error.message
                      );
                    }
                  }

        //Save generation to DB

        const generation = await Generation.create({
            user:req.user._id,
            prompt,
            content,
            mediaUrl,
            mediaType: mediaUrl ? "image" : undefined,
            tone
        })

        res.json(generation)
   

         }
         catch(error: any){
                res.status(500).json({message:error?.message || "Server Error"});

         }
}





// GET Generations
// GET /api/posts/generations


export const getGenerations = async (req:AuthRequest,res: Response):Promise<void> => {
        try {
            const generations = await Generation.find({user: req.user._id}).sort({createdAt: -1})
            res.json(generations)
        } catch (error: any) {
             res.status(500).json({message: error?.message || "Server Error"});

        }
}


// GET posts
// GET /api/posts


export const getPosts = async (req:AuthRequest,res: Response):Promise<void> => {
        
     try {
         const posts = await Post.find({user: req.user._id})
         res.json(posts);
        } catch (error: any) {
             res.status(500).json({message: error?.message || "Server Error"});

        }
}



//Schedule post
// POST /api/posts

export const schedulePosts = async (req:AuthRequest,res: Response):Promise<void> => {
        try {
            const {content,platforms,scheduledFor, status} = req.body;

            console.log("schedulePosts body:", { content, platforms, scheduledFor, status });
            console.log("schedulePosts file:", req.file ? {
                originalname: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype,
            } : null);

            //Parse platforms if it comes as a stringifies array from FormData

            let parsedPlatforms = platforms;
            if(typeof platforms === "string")
            {
                try {
                    parsedPlatforms = JSON.parse(platforms)
                } catch (error) {
                    parsedPlatforms = platforms.split(",")
                }
            }


            let mediaUrl: string | undefined = req.body.mediaUrl;
            let mediaType: "image"| "video" | undefined = req.body.mediaType;




            if(req.file){
                const result = await new Promise<any>((resolve,reject)=>{

                    const stream = cloudinary.uploader.upload_stream({resource_type: "auto",
                        folder: "Social-Scheduler"},(error,result)=>{
                            if(error) reject(error);
                            else resolve(result);


                        });

                        stream.end(req.file!.buffer)
                    

                });




                mediaUrl = result.secure_url;
                mediaType = result.resource_type === "video" ? "video" : "image";
            }




            const post = await Post.create({
                user:req.user._id,
                content,
                platforms: parsedPlatforms,
                scheduledFor,
                status,
                mediaUrl,
                mediaType,
              




            })

            console.log('Saved scheduled post:', { id: post._id, mediaUrl: post.mediaUrl, mediaType: post.mediaType, scheduledFor: post.scheduledFor });
            res.status(201).json(post);
















        } catch (error: any) {
             res.status(500).json({message: error?.message || "Server Error"});
        }
}