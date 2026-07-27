
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
                //Generate content
                const textResponse = await ai.models.generateContent({
                 model: "gemini-2.5-flash",
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

                   let mediaUrl ="";
                   let TempUrl=""

                  if (generateImage) {
  try {
    const HF_TOKEN = process.env.HF_TOKEN;

    if (HF_TOKEN) {
      const HFresponse = await axios.post(
        "https://router.huggingface.co/nscale/v1/images/generations",
        {
          model: "black-forest-labs/FLUX.1-schnell",
          prompt: imagePrompt,
          response_format: "b64_json",
        },
        {
          headers: {
            Authorization: `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Base64 image returned by Hugging Face
      const base64Image = HFresponse.data.data[0].b64_json;

      // Convert to data URL so it can be displayed directly
      TempUrl = `data:image/png;base64,${base64Image}`;

      //Upload to cloudinary for persistance

      const uploadResult = await cloudinary.uploader.upload(TempUrl,{
        folder:"ai-generations",
      })

      mediaUrl = uploadResult.secure_url;
   
   

    }

    
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
              




            })

            res.status(201).json(post);
















        } catch (error: any) {
             res.status(500).json({message: error?.message || "Server Error"});
        }
}