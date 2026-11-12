import React, { useState, useRef } from 'react';
import emailjs from '@emailjs/browser';
import { toast } from 'sonner';

function ContactUs() {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Fallback notification function
  const showNotification = (type: 'success' | 'error', title: string, description: string) => {
    try {
      if (type === 'success') {
        toast.success(title, { description });
      } else {
        toast.error(title, { description });
      }
    } catch (error) {
      // Fallback to browser alert if toast doesn't work
      alert(`${title}\n${description}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
    
    // Check if environment variables are set
    if (!serviceId || !templateId || !publicKey) {
      setIsSubmitting(false);
      showNotification('error', 'Configuration Error', 'Email service is not properly configured.');
      return;
    }
    
    emailjs.sendForm(serviceId, templateId, formRef.current!, publicKey)
      .then(() => {
        setIsSubmitting(false);
        setFormData({
          name: "",
          email: "",
          phone: "",
          message: "",
        });
        
        showNotification('success', 'Message sent successfully!', "Thank you for reaching out. We'll get back to you soon.");
      })
      .catch((error) => {
        setIsSubmitting(false);
        showNotification('error', 'Failed to send message', 'Please try again later or contact directly via email.');
        console.error('EmailJS Error:', error);
      });
  };

  return (
    <div>
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 grid-cols-1 gap-x-24">
            <div className="flex items-center lg:mb-0 mb-10">
              <div className="">
                <h4 className="text-indigo-600 text-base font-medium leading-6 mb-4 lg:text-left text-center">
                  Contact Us
                </h4>
                <h2 className="text-gray-900 font-manrope text-4xl font-semibold leading-10 mb-9 lg:text-left text-center">
                  Reach Out To Us
                </h2>
                <form ref={formRef} onSubmit={handleSubmit}>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full h-14 shadow-sm text-gray-600 placeholder-gray-400 text-lg font-normal leading-7 rounded-full border border-gray-200 focus:outline-none focus:border-indigo-600 py-2 px-4 mb-6"
                    placeholder="Name"
                    required
                  />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full h-14 shadow-sm text-gray-600 placeholder-gray-400 text-lg font-normal leading-7 rounded-full border border-gray-200 focus:outline-none focus:border-indigo-600 py-2 px-4 mb-6"
                    placeholder="Email"
                    required
                  />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full h-14 shadow-sm text-gray-600 placeholder-gray-400 text-lg font-normal leading-7 rounded-full border border-gray-200 focus:outline-none focus:border-indigo-600 py-2 px-4 mb-6"
                    placeholder="Phone"
                  />
                  <textarea
                    name="message"
                    value={formData.message}
                    onChange={handleInputChange}
                    className="w-full h-32 shadow-sm resize-none text-gray-600 placeholder-gray-400 text-lg font-normal leading-7 rounded-2xl border border-gray-200 focus:outline-none focus:border-indigo-600 px-4 py-4 mb-8"
                    placeholder="Message"
                    required
                  ></textarea>
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 text-center text-white text-base font-semibold leading-6 rounded-full bg-indigo-600 shadow transition-all duration-700 hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Sending...' : 'Submit'}
                  </button>
                </form>
              </div>
            </div>
            <div className="lg:max-w-xl w-full h-[600px] flex items-center justify-center bg-cover bg-no-repeat bg-[url('https://pagedone.io/asset/uploads/1696245837.png')]">
              <div className="">
                <div className="lg:w-96 w-auto h-auto bg-white shadow-xl lg:p-6 p-4 rounded-lg">
                  {/* Maileyo Logo */}
                  <div className="mb-6 flex justify-center">
                    <img 
                      src="/LogoPNG.png" 
                      alt="Maileyo" 
                      className="h-12 w-auto"
                    />
                    <h3 className="text-2xl font-bold text-gray-900 ml-3 self-center">Maileyo</h3>
                  </div>
                  
                  {/* Email */}
                  <div className="flex items-center mb-6">
                    <svg
                      width="30"
                      height="30"
                      viewBox="0 0 30 30"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M2.81501 8.75L10.1985 13.6191C12.8358 15.2015 14.1544 15.9927 15.6032 15.9582C17.0519 15.9237 18.3315 15.0707 20.8905 13.3647L27.185 8.75M12.5 25H17.5C22.214 25 24.5711 25 26.0355 23.5355C27.5 22.0711 27.5 19.714 27.5 15C27.5 10.286 27.5 7.92893 26.0355 6.46447C24.5711 5 22.214 5 17.5 5H12.5C7.78595 5 5.42893 5 3.96447 6.46447C2.5 7.92893 2.5 10.286 2.5 15C2.5 19.714 2.5 22.0711 3.96447 23.5355C5.42893 25 7.78595 25 12.5 25Z"
                        stroke="#000000"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <h5 className="text-black text-base font-normal leading-6 ml-5">
                      varun@maileyo.in
                    </h5>
                  </div>
                  
                  {/* Address */}
                  <div className="flex items-center mb-6">
                    <svg
                      width="30"
                      height="30"
                      viewBox="0 0 30 30"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M25 12.9169C25 17.716 21.1939 21.5832 18.2779 24.9828C16.8385 26.6609 16.1188 27.5 15 27.5C13.8812 27.5 13.1615 26.6609 11.7221 24.9828C8.80612 21.5832 5 17.716 5 12.9169C5 10.1542 6.05357 7.5046 7.92893 5.55105C9.8043 3.59749 12.3478 2.5 15 2.5C17.6522 2.5 20.1957 3.59749 22.0711 5.55105C23.9464 7.5046 25 10.1542 25 12.9169Z"
                        stroke="#000000"
                        strokeWidth="2"
                      />
                      <path
                        d="M17.5 11.6148C17.5 13.0531 16.3807 14.219 15 14.219C13.6193 14.219 12.5 13.0531 12.5 11.6148C12.5 10.1765 13.6193 9.01058 15 9.01058C16.3807 9.01058 17.5 10.1765 17.5 11.6148Z"
                        stroke="#000000"
                        strokeWidth="2"
                      />
                    </svg>
                    <h5 className="text-black text-base font-normal leading-6 ml-5">
                      Clement Town, Dehradun, 248002, India
                    </h5>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ContactUs;