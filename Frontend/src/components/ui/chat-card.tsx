import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSelector } from "react-redux";
import { Card, CardContent } from "@/components/ui/card";
// import { Skeleton } from "@/components/ui/skeleton";
function ChatCard() {
  const userMessage = useSelector((state: any) => state.userMessage || []);
  const modelMessage = useSelector((state: any) => state.modelMessage || []);
  const maxLength = Math.max(userMessage.length, modelMessage.length);
  return (
    <div className="mt-28 h-[37rem] m-auto max-w-4xl">
      {[...Array(maxLength)].map((_, index) => (
        <div key={index}>
          {userMessage[index] && (
            <div className="mb-2 text-right">
              <p className="dark:bg-[#27272a] max-w-2xl h-auto text-white rounded-lg py-2 px-4 inline-block break-words leading-7">
                {userMessage[index]}
              </p>
            </div>
          )}
          {modelMessage[index] && (
            <div className="mb-20 mt-10 flex">
              <Avatar className="w-8 h-8">
                <AvatarImage
                  src="https://github.com/shadcn.png"
                  className="w-10 h-10"
                />
                <AvatarFallback>CN</AvatarFallback>
              </Avatar>
              <p className="leading-7 rounded-lg text-[1rem.5] px-4 inline-block break-words max-w-full">
                {modelMessage[index]}
              </p>
            </div>
          )}
        </div>
      ))}

      <Card className="w-full mb-4 rounded-lg h-24 border-2 border-white cursor-pointer">
        <CardContent className="p-6 flex justify-between items-center ">
          <div>
            <span className="text-lg font-bold text-white">sender</span>
            <p className="text-sm text-white mt-2">
              email snippet Lorem ipsum dolor sit amet consectetur, adipisicing
              elit. Excepturi nostrum sit architecto amet minus. Cum minima
              
            </p>
          </div>
          <div>
            <p className="bg-red-400">label</p>
          </div>
        </CardContent>
      </Card>
      <Card className="w-full mb-4 rounded-lg h-24 border-2 border-white cursor-pointer">
        <CardContent className="p-6 flex justify-between items-center">
          <div>
            <span className="text-lg font-bold text-white">sender</span>
            <p className="text-sm text-white mt-2">
              email snippet Lorem ipsum dolor sit amet consectetur, adipisicing
              elit. Excepturi nostrum sit architecto amet minus. Cum minima
              atque error exercitationem laborum consectetur excepturi
              consequuntur. Commodi inventore maiores aperiam placeat,
              voluptatum earum?
            </p>
          </div>
          <div>
            <p>label</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ChatCard;
